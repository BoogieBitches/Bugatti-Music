"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { WaveformPlayer } from "./WaveformPlayer";
import { MixHistory, saveToHistory, type MixRecord } from "./MixHistory";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Track {
  id: string;
  name: string;
  size: number;
  file?: File;
  // Analysis results
  trackId?: string;       // backend UUID (for generation reuse)
  duration: string;
  durationSeconds?: number;
  bpm: number | null;
  key: string | null;
  camelot: string | null;
  energy: number | null;
  genre: string | null;
  sections?: Record<string, number>;
  beatgrid?: number[];
  analyzed: boolean;
  analyzing: boolean;
  analyzeStatus?: string;
  error?: string;
}

interface TransitionPlan {
  fromIdx: number;
  toIdx: number;
  score: number;
  bpmDiff: number;
  bpmCompat: number;
  keyCompat: number;
  energyFlow: "up" | "down" | "stable";
  energyDiff: number;
  transitionType: "cut" | "crossfade" | "filter_sweep" | "echo_out";
  transitionBars: number;
  description: string;
  fromCamelot: string;
  toCamelot: string;
}

type MixStyle = "house" | "club-house" | "bass-house" | "tech-house" | "techno" | "blend-mashup" | "bugatti";

interface JobStatus {
  job_id: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  message: string;
  duration_min?: number;
  track_count?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIX_STYLES: { id: MixStyle; label: string; bpm: string; desc: string; from: string; to: string }[] = [
  { id: "house",        label: "House",        bpm: "120–128", desc: "Classic deep grooves, soulful chords, euphoric builds",                 from: "#ffb800", to: "#ff5a00" },
  { id: "club-house",   label: "Club House",   bpm: "124–128", desc: "Peak-time dancefloor energy, punchy drops, crowd anthems",              from: "#ff3d9a", to: "#7a1fad" },
  { id: "bass-house",   label: "Bass House",   bpm: "126–132", desc: "Heavy basslines, filthy drops, maximum low-end pressure",               from: "#00d4ff", to: "#1e40ff" },
  { id: "tech-house",   label: "Tech House",   bpm: "122–126", desc: "Groovy, hypnotic, minimal drops, DJ-tool flow",                         from: "#00e5a8", to: "#00867d" },
  { id: "techno",       label: "Techno",       bpm: "128–140", desc: "Industrial darkness, relentless drive, peak-hour rave energy",           from: "#9b7aff", to: "#3b1d9c" },
  { id: "blend-mashup", label: "Blend / Mashup", bpm: "any",  desc: "Creative mashups and blends — mix vocals over different instrumentals",  from: "#ff6b35", to: "#f7c59f" },
];

const TRANS_LABELS: Record<string, string> = {
  cut: "Hard Cut", crossfade: "Crossfade",
  filter_sweep: "Filter Sweep", echo_out: "Echo Out",
};
const TRANS_COLORS: Record<string, string> = {
  cut:          "bg-red-500/20    text-red-300    border-red-500/30",
  crossfade:    "bg-green-500/20  text-green-300  border-green-500/30",
  filter_sweep: "bg-blue-500/20   text-blue-300   border-blue-500/30",
  echo_out:     "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

// ─── Camelot wheel ────────────────────────────────────────────────────────────

const CAMELOT_MINOR: Record<number, string> = {
  0:"8A",1:"3A",2:"10A",3:"5A",4:"12A",5:"7A",6:"2A",7:"9A",8:"4A",9:"11A",10:"6A",11:"1A",
};
const CAMELOT_MAJOR: Record<number, string> = {
  0:"8B",1:"3B",2:"10B",3:"5B",4:"12B",5:"7B",6:"2B",7:"9B",8:"4B",9:"11B",10:"6B",11:"1B",
};
const KEY_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const GENRES = ["Tech House","Techno","House","Progressive","Melodic","Afro House"];

function camelotScore(c1: string, c2: string): number {
  if (!c1 || !c2) return 50;
  if (c1 === c2) return 100;
  const n1 = parseInt(c1.slice(0,-1),10), l1 = c1.slice(-1);
  const n2 = parseInt(c2.slice(0,-1),10), l2 = c2.slice(-1);
  const diff = Math.min(Math.abs(n1-n2), 12-Math.abs(n1-n2));
  if (diff===0) return 85;
  if (diff===1 && l1===l2) return 80;
  if (diff===1 && l1!==l2) return 65;
  if (diff===2) return 45;
  return 20;
}

function computeTransition(a: Track, b: Track, fromIdx: number, toIdx: number): TransitionPlan {
  const bpmA = a.bpm??128, bpmB = b.bpm??128;
  const bpmDiff = Math.abs(bpmA-bpmB);
  const bpmCompat = Math.max(0, 100-Math.round(bpmDiff*7));
  const cA = a.camelot??"", cB = b.camelot??"";
  const keyCompat = camelotScore(cA,cB);
  const eA = a.energy??70, eB = b.energy??70;
  const eDiff = eB-eA;
  const energyFlow = eDiff>5?"up":eDiff<-5?"down":"stable";
  const score = Math.round(bpmCompat*0.40+keyCompat*0.45+(100-Math.min(100,Math.abs(eDiff)))*0.15);
  const combined = bpmCompat*0.45+keyCompat*0.55;
  let transitionType: TransitionPlan["transitionType"];
  // Raised from 85→96: nearly identical tracks only get a hard cut.
  // Everything else defaults to crossfade (smooth EQ blend).
  if (combined>=96 && Math.abs(eDiff)<=2) transitionType="cut";
  else if (combined>=55) transitionType="crossfade";
  else if (combined>=35) transitionType="filter_sweep";
  else transitionType="echo_out";
  const transitionBars = transitionType==="cut"?4:transitionType==="crossfade"&&bpmCompat>=85?16:32;
  const descriptions = {
    cut:"Hard cut at phrase boundary — instant swap",
    crossfade:`Smooth crossfade over ${transitionBars} bars`,
    filter_sweep:`High-pass out → low-pass in over ${transitionBars} bars`,
    echo_out:"Reverb tail leading into incoming intro",
  };
  return {
    fromIdx,toIdx,score,bpmDiff,bpmCompat,keyCompat,energyFlow,
    energyDiff:Math.abs(eDiff),transitionType,transitionBars,
    description:descriptions[transitionType],fromCamelot:cA,toCamelot:cB,
  };
}

// ─── Fake analysis fallback ────────────────────────────────────────────────────

function rb(a:number,b:number){return Math.floor(Math.random()*(b-a+1))+a;}
function fakeAnalysis(): Partial<Track> {
  const ki=rb(0,11), isM=Math.random()>0.5;
  return {
    bpm:rb(122,138), key:KEY_NAMES[ki]+(isM?"m":" maj"),
    camelot:isM?CAMELOT_MINOR[ki]:CAMELOT_MAJOR[ki],
    energy:rb(55,96), genre:GENRES[rb(0,GENRES.length-1)],
    duration:`${rb(4,8)}:${rb(0,59).toString().padStart(2,"0")}`,
    durationSeconds:rb(240,500),
    analyzed:true,analyzing:false,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmtBytes(b:number){return b<1024*1024?`${(b/1024).toFixed(0)} KB`:`${(b/1024/1024).toFixed(1)} MB`;}
function scoreColor(s:number){return s>=80?"#22c55e":s>=60?"#eab308":"#ef4444";}
function scoreLabel(s:number){return s>=80?"Perfect":s>=65?"Good":s>=50?"OK":"Hard";}

// Все запросы к аудио-бэкенду идут через /api/audio/* (Edge proxy на том же домене).
// Нет CORS, нет лимитов Vercel, нет прямых запросов на HF Space из браузера.
const AUDIO_API = "/api/audio";

// ─── Sub-components ───────────────────────────────────────────────────────────

function EnergyBar({value}:{value:number}){
  const color = value>=80?"var(--accent)":value>=60?"var(--accent-2)":"rgba(255,255,255,0.25)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{width:`${value}%`,background:color}}/>
      </div>
      <span className="text-xs text-white/50 w-5 text-right">{value}</span>
    </div>
  );
}

function ScoreRing({score}:{score:number}){
  const r=20, circ=2*Math.PI*r, dash=(score/100)*circ, color=scoreColor(score);
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4"/>
        <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{transition:"stroke-dasharray 0.6s ease"}}/>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-black" style={{color}}>{score}</span>
      </div>
    </div>
  );
}

function TransitionCard({plan,fromTrack,toTrack}:{plan:TransitionPlan;fromTrack:Track;toTrack:Track}){
  const [expanded,setExpanded]=useState(false);
  return (
    <div className="relative flex flex-col items-center my-1">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-3 bg-white/10"/>
      <button onClick={()=>setExpanded(v=>!v)}
        className={`w-full max-w-3xl bs-card border px-4 py-3 transition-all duration-200 text-left
          ${plan.score>=80?"border-green-500/20 hover:border-green-500/40":
            plan.score>=60?"border-yellow-500/20 hover:border-yellow-500/40":
            "border-red-500/20 hover:border-red-500/40"}`}>
        <div className="flex items-center gap-4">
          <ScoreRing score={plan.score}/>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-white/70 truncate max-w-[110px]">{fromTrack.name}</span>
              <span className="text-white/25 text-xs">→</span>
              <span className="text-xs font-semibold text-white/70 truncate max-w-[110px]">{toTrack.name}</span>
            </div>
            <div className="text-xs text-white/40">{plan.description}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-2 py-0.5 rounded border text-xs font-bold ${TRANS_COLORS[plan.transitionType]}`}>
              {TRANS_LABELS[plan.transitionType]}
            </span>
            <span className="text-xs text-white/25">{plan.transitionBars} bars</span>
            <span className={`text-xs transition-transform text-white/30 ${expanded?"rotate-180":""}`}>▼</span>
          </div>
        </div>
        {expanded&&(
          <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/30 uppercase tracking-widest">BPM</span>
              <div className="flex items-center gap-1 text-xs font-mono">
                <span className="text-[var(--accent-2)]">{fromTrack.bpm}</span>
                <span className="text-white/30">→</span>
                <span className="text-[var(--accent-2)]">{toTrack.bpm}</span>
                {plan.bpmDiff>0&&<span className={plan.bpmCompat>=80?"text-green-400":plan.bpmCompat>=50?"text-yellow-400":"text-red-400"}>({plan.bpmDiff>0?"+":""}{Math.round(plan.bpmDiff)})</span>}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/30 uppercase tracking-widest">Key</span>
              <div className="flex items-center gap-1 text-xs font-mono">
                <span className="px-1 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent-2)]">{plan.fromCamelot||fromTrack.key}</span>
                <span className="text-white/30">→</span>
                <span className="px-1 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent-2)]">{plan.toCamelot||toTrack.key}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/30 uppercase tracking-widest">Energy</span>
              <span className={`text-xs ${plan.energyFlow==="up"?"text-green-400":plan.energyFlow==="down"?"text-red-400":"text-white/50"}`}>
                {plan.energyFlow==="up"?"↑ Building":plan.energyFlow==="down"?"↓ Dropping":"→ Stable"}
                {plan.energyDiff>0&&<span className="text-white/30 ml-1">({plan.energyDiff}pt)</span>}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/30 uppercase tracking-widest">Rating</span>
              <span className="text-sm font-bold" style={{color:scoreColor(plan.score)}}>{scoreLabel(plan.score)}</span>
            </div>
          </div>
        )}
      </button>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-3 bg-white/10"/>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AIMixStudioProps {
  userRole?: "user" | "admin";
  isPremium?: boolean;
  generationsUsed?: number;
  isLoggedIn?: boolean;
}

export function AIMixStudio({
  userRole = "user",
  isPremium = false,
  generationsUsed = 0,
  isLoggedIn = false,
}: AIMixStudioProps) {
  const FREE_LIMIT = 1;
  const isAdmin = userRole === "admin";
  const hasUnlimited = isAdmin || isPremium;
  // Track locally so the UI updates immediately after first use without reload
  const [localGenerationsUsed, setLocalGenerationsUsed] = useState(generationsUsed);
  const quotaExceeded = !hasUnlimited && localGenerationsUsed >= FREE_LIMIT;

  const [tracks,setTracks] = useState<Track[]>([]);
  const [dragging,setDragging] = useState(false);
  const [selectedStyle,setSelectedStyle] = useState<MixStyle|null>("bugatti");
  const [generating,setGenerating] = useState(false);
  const [genProgress,setGenProgress] = useState(0);
  const [genMessage,setGenMessage] = useState("");
  const [done,setDone] = useState(false);
  const [jobId,setJobId] = useState<string|null>(null);
  const [jobDuration,setJobDuration] = useState<number|null>(null);
  const [genError,setGenError] = useState<string|null>(null);
  const [prompt,setPrompt] = useState("");
  const [promptMode,setPromptMode] = useState(false);
  const [showTransitions,setShowTransitions] = useState(true);
  const [dragOverIdx,setDragOverIdx] = useState<number|null>(null);
  const [reorderIdx,setReorderIdx] = useState<number|null>(null);
  // restored mix from history
  const [restoredMix,setRestoredMix] = useState<{jobId:string;durationMin:number|null;apiBase:string}|null>(null);
  // Master BPM for whole mix (Serato-style sync)
  const [targetBpm,setTargetBpm] = useState<number|null>(null);
  // AI set planner
  const [aiPlanning,setAiPlanning] = useState(false);
  const [aiPlan,setAiPlan] = useState<{reasoning:string;energy_arc:string}|null>(null);
  const [aiPlanError,setAiPlanError] = useState<string|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const pollFailRef = useRef<number>(0);
  const pollStartRef = useRef<number>(0);
  const pollLastProgressRef = useRef<number>(-1);
  const pollLastProgressTimeRef = useRef<number>(0);
  // keep a ref to tracks+style at generation time for history saving
  const genSnapshotRef = useRef<{tracks:Track[];style:MixStyle;avgScore:number|null}|null>(null);

  // ── Polling ───────────────────────────────────────────────────────────────

  useEffect(()=>()=>{if(pollRef.current)clearInterval(pollRef.current);},[]);
  // Auto-set target BPM from first analyzed track (only when not manually set)
  useEffect(()=>{
    const analyzed = tracks.filter(t=>t.bpm&&!t.analyzing);
    if(analyzed.length>0&&targetBpm===null){
      setTargetBpm(Math.round(analyzed[0].bpm!));
    }
  },[tracks]);

  function startPolling(jid: string) {
    const apiBase = AUDIO_API;
    pollFailRef.current = 0;
    pollStartRef.current = Date.now();
    pollLastProgressRef.current = -1;
    pollLastProgressTimeRef.current = Date.now();
    pollRef.current = setInterval(async()=>{
      try {
        const res = await fetch(`${apiBase}/audio/jobs/${jid}`);

        // 404 = сервер перезагрузился, job потерян
        if(res.status === 404){
          clearInterval(pollRef.current!);
          setGenerating(false);
          setGenError("Сервер перезагрузился во время генерации. Пожалуйста, начните заново.");
          return;
        }

        // Другие ошибки — считаем попытки (сеть может временно отвалиться)
        if(!res.ok){
          pollFailRef.current += 1;
          if(pollFailRef.current >= 10){
            clearInterval(pollRef.current!);
            setGenerating(false);
            setGenError(`Сервер недоступен (HTTP ${res.status}). Попробуйте позже.`);
          }
          return;
        }

        pollFailRef.current = 0;
        const data: JobStatus = await res.json();
        setGenProgress(data.progress);
        setGenMessage(data.message);

        // Обновляем время последнего изменения прогресса
        if(data.progress !== pollLastProgressRef.current){
          pollLastProgressRef.current = data.progress;
          pollLastProgressTimeRef.current = Date.now();
        }

        // Таймаут: если прогресс не менялся 5 минут — что-то пошло не так
        const staleMs = Date.now() - pollLastProgressTimeRef.current;
        if(data.status === "running" && staleMs > 5 * 60 * 1000){
          clearInterval(pollRef.current!);
          setGenerating(false);
          setGenError("Генерация зависла (нет прогресса 5 минут). Попробуйте с меньшим числом треков или повторите позже.");
          return;
        }

        if(data.status==="done"){
          clearInterval(pollRef.current!);
          setGenerating(false);
          setDone(true);
          const durMin = data.duration_min??null;
          setJobDuration(durMin);
          // save to history
          const snap = genSnapshotRef.current;
          if(snap){
            const styleObj = MIX_STYLES.find(s=>s.id===snap.style);
            saveToHistory({
              jobId:jid,
              style:snap.style,
              styleLabel:styleObj?.label??snap.style,
              trackCount:snap.tracks.length,
              trackNames:snap.tracks.map(t=>t.name),
              avgScore:snap.avgScore,
              durationMin:durMin,
              createdAt:new Date().toISOString(),
              apiBase:AUDIO_API,
            });
          }
        } else if(data.status==="error"){
          clearInterval(pollRef.current!);
          setGenerating(false);
          setGenError(data.message||"Generation failed");
        }
      } catch { /* network glitch, retry next tick */ }
    }, 1500);
  }

  // ── Analysis ──────────────────────────────────────────────────────────────

  async function analyzeTrackFile(file: File, retries = 3): Promise<Partial<Track>> {
    // Анализ через /api/analyze (Edge route) — нет CORS, нет лимитов Vercel
    for (let attempt = 0; attempt < retries; attempt++) {
      const controller = new AbortController();
      // Таймаут 90 сек — если HF Space не ответил, не висим вечно
      const timer = setTimeout(() => controller.abort(), 90_000);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${AUDIO_API}/analyze`, {
          method: "POST", body: form, signal: controller.signal,
        });
        clearTimeout(timer);
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if(!d.track_id) throw new Error("No track_id in response");
        return {
          trackId:d.track_id,
          bpm:d.bpm??null, key:d.key??null, camelot:d.camelot??null,
          energy:d.energy??null, genre:d.genre??null, duration:d.duration??"?:??",
          durationSeconds:d.duration_seconds, sections:d.sections,
          beatgrid:Array.isArray(d.beatgrid) ? d.beatgrid : undefined,
          analyzed:true, analyzing:false, analyzeStatus:undefined, error:undefined,
        };
      } catch(err) {
        clearTimeout(timer);
        const isTimeout = err instanceof Error && err.name === "AbortError";
        if (attempt < retries - 1) {
          // При таймауте или ошибке — небольшая пауза и повтор
          await new Promise(r => setTimeout(r, 3_000));
          // Показываем статус retry в UI
          setTracks(t=>t.map(x=>x.file===file
            ? {...x, analyzeStatus: isTimeout ? "Timeout, retrying..." : "Retrying..."}
            : x));
        } else {
          const msg = isTimeout ? "Timeout (90s)" : err instanceof Error ? err.message : "Analysis failed";
          return {analyzed:false, analyzing:false, analyzeStatus:undefined, error:msg};
        }
      }
    }
    return {analyzed:false, analyzing:false, error:"Analysis failed"};
  }

  const addFiles = useCallback((files: FileList|null)=>{
    if(!files) return;
    const newTracks: Track[] = [];
    for(let i=0;i<files.length;i++){
      const f=files[i];
      if(!f.name.match(/\.(mp3|wav|flac|aiff|m4a)$/i)&&!f.type.startsWith("audio/")) continue;
      newTracks.push({
        id:`${Date.now()}-${i}`, name:f.name.replace(/\.[^.]+$/,""),
        size:f.size, file:f, duration:"", bpm:null, key:null, camelot:null,
        energy:null, genre:null, analyzed:false, analyzing:false,
      });
    }
    setTracks(t=>[...t,...newTracks]);
    // Параллельный анализ — быстро когда HF Space уже тёплый
    newTracks.forEach(track => {
      setTracks(t=>t.map(x=>x.id===track.id?{...x,analyzing:true}:x));
      analyzeTrackFile(track.file!).then(analysis => {
        setTracks(t=>t.map(x=>x.id===track.id?{...x,...analysis}:x));
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  function handleDrop(e:React.DragEvent){e.preventDefault();setDragging(false);addFiles(e.dataTransfer.files);}

  // ── Reorder ───────────────────────────────────────────────────────────────

  function handleReorderDrop(toIdx:number){
    if(reorderIdx===null||reorderIdx===toIdx) return;
    setTracks(t=>{const a=[...t];const[i]=a.splice(reorderIdx,1);a.splice(toIdx,0,i);return a;});
    setDragOverIdx(null);setReorderIdx(null);
  }

  // ── Generate ──────────────────────────────────────────────────────────────

  async function retryAnalyze(trackId: string) {
    const track = tracks.find(t=>t.id===trackId);
    if(!track?.file) return;
    setTracks(t=>t.map(x=>x.id===trackId?{...x,analyzing:true,error:undefined}:x));
    const analysis = await analyzeTrackFile(track.file);
    setTracks(t=>t.map(x=>x.id===trackId?{...x,...analysis}:x));
  }

  async function handleGenerate(){
    if(!selectedStyle||tracks.length===0) return;

    // Guard: all tracks must have a backend trackId
    const missingStore = tracks.filter(t=>!t.trackId);
    if(missingStore.length>0){
      setGenError(`${missingStore.length} track${missingStore.length>1?"s":""} not uploaded to server yet. Re-analyze them first (click ↺ next to the track).`);
      return;
    }

    // Server-side quota check (cannot be bypassed)
    if(!hasUnlimited){
      try{
        const qRes = await fetch("/api/mix/use-generation",{method:"POST"});
        const qData = await qRes.json();
        if(!qRes.ok||!qData.allowed){
          if(qData.reason==="not_authenticated"){
            setGenError("Please log in to generate a mix.");
          } else {
            setLocalGenerationsUsed(qData.generations_used??1);
          }
          return;
        }
        setLocalGenerationsUsed(qData.generations_used??1);
      } catch {
        setGenError("Could not verify your quota. Check your connection and try again.");
        return;
      }
    }

    setGenerating(true); setGenProgress(2); setGenMessage("Submitting tracks...");
    setDone(false); setJobId(null); setGenError(null);

    const apiBase = AUDIO_API;
    const transPlans = transitions; // computed below

    try {
      const payload = {
        tracks: tracks.map(t=>({
          track_id: t.trackId!,
          id: t.trackId!,
          bpm: t.bpm, energy: t.energy,
          duration_seconds: t.durationSeconds||300,
          sections: t.sections||{},
          camelot: t.camelot,
          beatgrid: t.beatgrid ?? null,
        })),
        transitions: transPlans.map(p=>({
          from_track_id: tracks[p.fromIdx].trackId||tracks[p.fromIdx].id,
          to_track_id:   tracks[p.toIdx].trackId||tracks[p.toIdx].id,
          transition_type: p.transitionType,
          transition_bars: p.transitionBars,
          bpm_a: tracks[p.fromIdx].bpm||128,
          bpm_b: tracks[p.toIdx].bpm||128,
        })),
        mix_style: selectedStyle,
        target_bpm: targetBpm ?? (tracks[0]?.bpm || 128),
      };

      const res = await fetch(`${apiBase}/audio/generate`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload),
      });

      if(!res.ok){
        const err = await res.json().catch(()=>({detail:"Unknown error"}));
        throw new Error(err.detail||`HTTP ${res.status}`);
      }

      const {job_id} = await res.json();
      setJobId(job_id);
      // save snapshot for history
      genSnapshotRef.current = {tracks:[...tracks],style:selectedStyle,avgScore};
      startPolling(job_id);
    } catch(e:unknown){
      setGenerating(false);
      setGenError(e instanceof Error ? e.message : "Generation failed");
    }
  }

  function removeTrack(id:string){setTracks(t=>t.filter(x=>x.id!==id));if(done)setDone(false);}

  async function handleAiPlan(){
    if(aiPlanning||tracks.length<2||!allAnalyzed) return;
    setAiPlanning(true); setAiPlan(null); setAiPlanError(null);
    const apiBase = AUDIO_API;
    try{
      const payload = {
        tracks: tracks.map(t=>({
          id: t.trackId||t.id,
          name: t.name,
          bpm: t.bpm??128,
          key: t.key,
          camelot: t.camelot,
          energy: t.energy??50,
          genre: t.genre,
          duration: t.durationSeconds??300,
        }))
      };
      const res = await fetch(`${apiBase}/audio/plan`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload),
      });
      if(!res.ok){
        const err = await res.json().catch(()=>({detail:"Unknown error"}));
        throw new Error(err.detail||`HTTP ${res.status}`);
      }
      const data:{order:number[];reasoning:string;energy_arc:string} = await res.json();
      // reorder tracks
      setTracks(prev=>{
        const reordered = data.order.map(i=>prev[i]).filter(Boolean);
        return reordered.length===prev.length ? reordered : prev;
      });
      setAiPlan({reasoning:data.reasoning,energy_arc:data.energy_arc});
    } catch(e:unknown){
      setAiPlanError(e instanceof Error ? e.message : "AI planning failed");
    } finally{
      setAiPlanning(false);
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const analyzedCount = tracks.filter(t=>t.analyzed).length;
  const allAnalyzed = tracks.length>0 && analyzedCount===tracks.length;
  const avgBpm = allAnalyzed ? Math.round(tracks.reduce((s,t)=>s+(t.bpm??0),0)/tracks.length) : null;

  const transitions: TransitionPlan[] = allAnalyzed && tracks.length>=2
    ? tracks.slice(0,-1).map((t,i)=>computeTransition(t,tracks[i+1],i,i+1))
    : [];

  const avgScore = transitions.length
    ? Math.round(transitions.reduce((s,t)=>s+t.score,0)/transitions.length)
    : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 pb-24">

      {/* Hero */}
      <div className="pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-xs font-semibold text-[var(--accent-2)] tracking-widest uppercase mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse"/>
          Powered by AI
        </div>
        <h1 className="text-5xl md:text-6xl font-black tracking-tight bs-text-gradient leading-none mb-4">AI MIX STUDIO</h1>
        <p className="text-lg text-white/50 max-w-xl mx-auto">Upload your tracks and let AI create a professional DJ mix automatically.</p>
      </div>

      {/* Restored mix from history */}
      {restoredMix&&!done&&!generating&&(
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/30 uppercase tracking-widest">Restored from history</span>
            <button onClick={()=>setRestoredMix(null)} className="text-xs text-white/20 hover:text-white/60 transition-colors">✕ Close</button>
          </div>
          <WaveformPlayer
            url={`${restoredMix.apiBase}/audio/jobs/${restoredMix.jobId}/download`}
            durationMin={restoredMix.durationMin}
            downloadFilename={`bugatti-mix-${restoredMix.jobId.slice(0,8)}.mp3`}
          />
        </div>
      )}

      {/* Mix History */}
      {!done&&!generating&&(
        <MixHistory onRestore={(r)=>{
          setRestoredMix({jobId:r.jobId,durationMin:r.durationMin,apiBase:r.apiBase});
          window.scrollTo({top:0,behavior:"smooth"});
        }}/>
      )}

      {/* Upload Zone */}
      {!done&&(
        <div
          onDragOver={e=>{e.preventDefault();setDragging(true);}}
          onDragLeave={()=>setDragging(false)}
          onDrop={handleDrop}
          onClick={()=>fileRef.current?.click()}
          className={`bs-card p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-200 mb-4
            ${dragging?"border-[var(--accent)] bg-[var(--accent)]/8 scale-[1.01]":"hover:border-white/20 hover:bg-white/[0.02]"}`}>
          <input ref={fileRef} type="file" multiple accept=".mp3,.wav,.flac,.aiff,.m4a,audio/*"
            className="hidden" onChange={e=>addFiles(e.target.files)}/>
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-3xl">🎵</div>
          <div className="text-center">
            <div className="font-bold text-lg text-white">UPLOAD TRACKS</div>
            <div className="text-sm text-white/40 mt-1">Drag & drop or click · MP3, WAV, FLAC</div>
          </div>
          {dragging&&<div className="text-[var(--accent-2)] text-sm font-semibold">Drop files here...</div>}
        </div>
      )}

      {/* Track List */}
      {tracks.length>0&&!done&&(
        <div className="bs-card overflow-hidden mb-4">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
            <span className="text-sm font-semibold text-white/70">
              {tracks.length} track{tracks.length!==1?"s":""} · {analyzedCount}/{tracks.length} analyzed
            </span>
            <div className="flex items-center gap-3">
              {allAnalyzed&&tracks.length>=2&&(
                <button
                  onClick={handleAiPlan}
                  disabled={aiPlanning}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent-2)] hover:bg-[var(--accent)]/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {aiPlanning
                    ? <><span className="w-3 h-3 border-2 border-[var(--accent-2)] border-t-transparent rounded-full animate-spin inline-block"/>Thinking...</>
                    : <>✨ AI Order</>}
                </button>
              )}
              <button onClick={()=>fileRef.current?.click()} className="text-xs text-[var(--accent-2)] hover:text-white transition-colors">+ Add more</button>
            </div>
          </div>

          <div className="hidden sm:grid grid-cols-[24px_1fr_60px_52px_72px_100px_88px_24px] gap-2 px-5 py-2 text-xs text-white/25 uppercase tracking-widest border-b border-white/5">
            <span/><span>Track</span><span className="text-right">Dur</span>
            <span className="text-center">BPM</span><span className="text-center">Key</span>
            <span>Energy</span><span>Genre</span><span/>
          </div>

          <div className="divide-y divide-white/5">
            {tracks.map((track,idx)=>(
              <div key={track.id} draggable
                onDragStart={()=>setReorderIdx(idx)}
                onDragOver={e=>{e.preventDefault();setDragOverIdx(idx);}}
                onDrop={()=>handleReorderDrop(idx)}
                onDragEnd={()=>{setDragOverIdx(null);setReorderIdx(null);}}
                className={`flex items-center gap-2 px-5 py-3 transition-colors cursor-grab active:cursor-grabbing
                  ${dragOverIdx===idx&&reorderIdx!==idx?"bg-[var(--accent)]/10":"hover:bg-white/[0.02]"}`}>
                <div className="w-6 text-center text-xs text-white/25 select-none shrink-0">
                  {track.analyzing
                    ? <span className="inline-block w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin"/>
                    : <span>{idx+1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{track.name}</span>
                    {track.trackId&&<span className="shrink-0 text-[10px] text-green-400/60">✓ stored</span>}
                  </div>
                  <div className="text-xs text-white/30">{fmtBytes(track.size)}</div>
                </div>
                {track.analyzed?(
                  <>
                    <div className="hidden sm:block text-xs text-white/50 w-12 text-right shrink-0">{track.duration}</div>
                    <div className="hidden sm:block text-xs font-mono text-[var(--accent-2)] w-10 text-center shrink-0">{track.bpm}</div>
                    <div className="hidden md:block w-16 text-center shrink-0">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--accent)]/12 text-[var(--accent-2)] font-mono">{track.camelot||track.key}</span>
                    </div>
                    <div className="hidden md:block w-24 shrink-0"><EnergyBar value={track.energy!}/></div>
                    <div className="hidden lg:block text-xs text-white/40 w-20 text-right truncate shrink-0">{track.genre}</div>
                  </>
                ):track.error?(
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs text-red-400 truncate" title={track.error}>⚠ {track.error}</span>
                    {track.file&&(
                      <button onClick={()=>retryAnalyze(track.id)}
                        disabled={track.analyzing}
                        className="shrink-0 text-xs px-2 py-0.5 rounded bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent-2)] hover:bg-[var(--accent)]/25 transition-all disabled:opacity-40">
                        ↺ Retry
                      </button>
                    )}
                  </div>
                ):(
                  <div className="text-xs text-white/25 italic">{track.analyzeStatus||"Analyzing..."}</div>
                )}
                <button onClick={()=>removeTrack(track.id)}
                  className="w-6 h-6 flex items-center justify-center text-white/20 hover:text-red-400 transition-colors text-lg shrink-0">×</button>
              </div>
            ))}
          </div>
          {tracks.length>1&&<div className="px-5 py-2 border-t border-white/5 text-xs text-white/20">↕ Drag rows to reorder</div>}
        </div>
      )}

      {/* AI Plan Result */}
      {(aiPlan||aiPlanError)&&!done&&(
        <div className={`bs-card px-5 py-4 mb-4 ${aiPlanError?"border-red-500/20":"border-[var(--accent)]/20"}`}>
          {aiPlanError?(
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <span>⚠</span><span>{aiPlanError}</span>
            </div>
          ):(
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black bs-text-gradient uppercase tracking-widest">✨ AI Set Plan Applied</span>
                <button onClick={()=>setAiPlan(null)} className="ml-auto text-white/20 hover:text-white/50 transition-colors text-sm">✕</button>
              </div>
              {aiPlan?.energy_arc&&(
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <span className="text-[var(--accent-2)]">⚡</span>
                  <span>{aiPlan.energy_arc}</span>
                </div>
              )}
              {aiPlan?.reasoning&&(
                <p className="text-xs text-white/40 leading-relaxed">{aiPlan.reasoning}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Transition Preview */}
      {allAnalyzed&&transitions.length>0&&!done&&(
        <div className="mb-4">
          <button onClick={()=>setShowTransitions(v=>!v)}
            className="w-full flex items-center justify-between px-5 py-3 bs-card hover:bg-white/[0.03] transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-sm font-black bs-text-gradient">TRANSITION PREVIEW</span>
              <span className="text-xs text-white/40">{transitions.length} transition{transitions.length!==1?"s":""}</span>
              {avgScore!==null&&(
                <span className="px-2 py-0.5 rounded-full text-xs font-bold border"
                  style={{color:scoreColor(avgScore),borderColor:scoreColor(avgScore)+"44",background:scoreColor(avgScore)+"15"}}>
                  Avg {avgScore}
                </span>
              )}
            </div>
            <span className={`text-white/30 text-xs transition-transform ${showTransitions?"rotate-180":""}`}>▼</span>
          </button>

          {showTransitions&&(
            <div className="relative">
              <div className="mx-auto max-w-3xl px-4 py-2 flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/5 mb-1">
                <span className="w-5 h-5 rounded-full bg-[var(--accent)]/20 text-[var(--accent-2)] text-xs flex items-center justify-center font-bold">1</span>
                <span className="text-sm font-medium text-white/80 truncate">{tracks[0].name}</span>
                <span className="ml-auto text-xs font-mono text-[var(--accent-2)]">{tracks[0].bpm} BPM · {tracks[0].camelot}</span>
              </div>
              {transitions.map((plan,i)=>(
                <div key={`t-${i}`}>
                  <TransitionCard plan={plan} fromTrack={tracks[plan.fromIdx]} toTrack={tracks[plan.toIdx]}/>
                  <div className="mx-auto max-w-3xl px-4 py-2 flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/5 mt-1 mb-1">
                    <span className="w-5 h-5 rounded-full bg-[var(--accent)]/20 text-[var(--accent-2)] text-xs flex items-center justify-center font-bold">{plan.toIdx+1}</span>
                    <span className="text-sm font-medium text-white/80 truncate">{tracks[plan.toIdx].name}</span>
                    <span className="ml-auto text-xs font-mono text-[var(--accent-2)]">{tracks[plan.toIdx].bpm} BPM · {tracks[plan.toIdx].camelot}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Style + Generate */}
      {allAnalyzed&&!generating&&!done&&(
        <>
          {/* AI FROM PROMPT */}
          <div className="mb-4">
            <button onClick={()=>setPromptMode(v=>!v)}
              className="flex items-center gap-2 text-sm text-[var(--accent-2)] hover:text-white transition-colors font-semibold">
              <span className="w-5 h-5 flex items-center justify-center rounded-md bg-[var(--accent)]/20 text-xs">{promptMode?"−":"+"}</span>
              AI MIX FROM PROMPT {promptMode?"(hide)":""}
            </button>
            {promptMode&&(
              <div className="mt-3 bs-card p-4">
                <p className="text-xs text-white/40 mb-2">Describe the vibe — AI will build the set accordingly.</p>
                <textarea value={prompt} onChange={e=>setPrompt(e.target.value)}
                  placeholder={'"Create a 60-minute club set in the style of G-Pol and Jean Biscuit. Start smooth, build energy gradually, peak-time atmosphere."'}
                  rows={3} className="bs-input w-full text-sm resize-none"/>
              </div>
            )}
          </div>

          {/* BUGATTI MODE — only mode */}
          <div className="mb-4">
            <div className="w-full relative overflow-hidden rounded-2xl p-5 border border-[var(--accent)]/40 shadow-[0_0_40px_-8px_rgba(122,85,255,0.4)]"
              style={{background:"linear-gradient(135deg,rgba(122,85,255,0.15),rgba(184,157,255,0.10))"}}>
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl" style={{background:"linear-gradient(135deg,rgba(122,85,255,0.18),rgba(184,157,255,0.12))"}}/>
              <div className="relative flex items-start gap-4">
                <div className="text-3xl shrink-0">🏎</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-black text-lg bs-text-gradient">BUGATTI MODE</span>
                    <span className="px-2 py-0.5 rounded-full bg-[var(--accent)]/30 text-[var(--accent-2)] text-[10px] font-bold border border-[var(--accent)]/30">✓ ACTIVE</span>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed">Advanced AI analyzes BPM, key, energy and track structure to create a professional DJ mix with beatmatching, harmonic mixing, phrase matching, intelligent EQ transitions and loudness balancing.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Target BPM: Serato-style master BPM for the whole mix */}
          {tracks.some(t=>t.bpm&&!t.analyzing)&&(
            <div className="mb-4 px-4 py-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white/70 mb-0.5">🎯 Target BPM</div>
                <div className="text-[10px] text-white/30">Все треки синхронизируются к этому BPM (ударник в ударник)</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={()=>setTargetBpm(b=>Math.max(60,Math.round((b??128)-1)))}
                  className="w-6 h-6 rounded-md bg-white/10 hover:bg-white/20 text-white/60 text-sm font-bold flex items-center justify-center transition-colors">−</button>
                <input
                  type="number" min={60} max={220} step={1}
                  value={targetBpm??''} placeholder="128"
                  onChange={e=>{const v=parseInt(e.target.value);if(!isNaN(v)&&v>=40&&v<=300)setTargetBpm(v);else if(e.target.value==='')setTargetBpm(null);}}
                  className="w-14 text-center bg-black/30 border border-white/20 rounded-lg py-1 text-sm font-bold text-white focus:outline-none focus:border-[var(--accent)]"
                />
                <button onClick={()=>setTargetBpm(b=>Math.min(220,Math.round((b??128)+1)))}
                  className="w-6 h-6 rounded-md bg-white/10 hover:bg-white/20 text-white/60 text-sm font-bold flex items-center justify-center transition-colors">+</button>
              </div>
            </div>
          )}

          {genError&&(
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/20 border border-red-500/30 text-sm text-red-300">
              ⚠ {genError}
            </div>
          )}

          {/* Quota banner for free users */}
          {!hasUnlimited&&!quotaExceeded&&(
            <div className="mb-4 px-4 py-3 rounded-lg bg-white/5 border border-white/10 flex items-center gap-3">
              <span className="text-2xl">🎁</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">1 free generation</div>
                <div className="text-xs text-white/40">Subscribe for unlimited AI mixes</div>
              </div>
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/30 text-green-300 text-xs font-bold">
                {localGenerationsUsed}/{FREE_LIMIT} used
              </span>
            </div>
          )}

          {/* Paywall — quota exceeded */}
          {quotaExceeded?(
            <div className="rounded-2xl overflow-hidden border border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent)]/10 to-purple-900/20 p-6 text-center">
              <div className="text-3xl mb-3">🔒</div>
              <div className="text-lg font-black text-white mb-1">Free generation used</div>
              <div className="text-sm text-white/50 mb-5">
                You&apos;ve used your 1 free AI mix.<br/>Subscribe to unlock unlimited generations.
              </div>
              <a href="/pricing"
                className="inline-block w-full py-4 rounded-xl text-base font-black tracking-wide transition-all duration-200 hover:scale-[1.02]"
                style={{background:"linear-gradient(135deg,var(--accent),var(--accent-2))",color:"#000"}}>
                UPGRADE TO PREMIUM →
              </a>
              {!isLoggedIn&&(
                <p className="mt-3 text-xs text-white/30">
                  Already subscribed?{" "}
                  <a href="/login" className="text-[var(--accent-2)] hover:underline">Log in</a>
                </p>
              )}
            </div>
          ):(
            <button onClick={handleGenerate}
              className="w-full bs-button bs-button-primary py-5 text-lg font-black tracking-wide transition-all duration-200 hover:scale-[1.01]">
              GENERATE MIX
            </button>
          )}
        </>
      )}

      {/* Generation Progress */}
      {generating&&(
        <div className="bs-card p-8 text-center">
          <div className="inline-flex w-16 h-16 rounded-full border-4 border-[var(--accent)]/30 border-t-[var(--accent)] animate-spin mb-4"/>
          <div className="text-lg font-bold text-white mb-2">{genMessage||"Processing..."}</div>
          <div className="text-xs text-white/30 mb-6">{genProgress}% complete</div>
          <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-700"
              style={{width:`${genProgress}%`}}/>
          </div>
          {jobId&&<div className="mt-3 text-xs text-white/20">Job {jobId.slice(0,8)}</div>}
        </div>
      )}

      {/* Result */}
      {done&&jobId&&(
        <div className="space-y-4">
          <WaveformPlayer
            url={`${AUDIO_API}/audio/jobs/${jobId}/download`}
            durationMin={jobDuration}
            downloadFilename={`bugatti-mix-${jobId.slice(0,8)}.mp3`}
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {label:"Duration",    value:`${jobDuration??rb(55,75)} min`},
              {label:"Mix BPM",     value:`${targetBpm??avgBpm??rb(126,132)}`},
              {label:"Tracks",      value:`${tracks.length}`},
              {label:"Transitions", value:`${tracks.length-1}`},
            ].map(s=>(
              <div key={s.label} className="bs-card p-4 text-center">
                <div className="text-2xl font-black text-white">{s.value}</div>
                <div className="text-xs text-white/40 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {avgScore!==null&&(
            <div className="bs-card p-4 flex items-center gap-4">
              <ScoreRing score={avgScore}/>
              <div>
                <div className="text-sm font-bold text-white">Set Compatibility Score</div>
                <div className="text-xs text-white/40 mt-0.5">Harmonic matching · BPM flow · Energy arc</div>
              </div>
            </div>
          )}

          <div className="bs-card p-5">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Applied Techniques</div>
            <div className="flex flex-wrap gap-2">
              {["Beatmatching","Harmonic Mixing","Phrase Matching","Intelligent EQ","Filter Sweeps","Smooth Crossfades","Gain Automation","Loudness Balancing"].map(t=>(
                <span key={t} className="px-2 py-1 rounded-md bg-[var(--accent)]/12 border border-[var(--accent)]/20 text-xs text-[var(--accent-2)]">{t}</span>
              ))}
            </div>
          </div>

          <button onClick={()=>{setTracks([]);setDone(false);setSelectedStyle("bugatti");setPrompt("");setPromptMode(false);setJobId(null);setGenError(null);setRestoredMix(null);genSnapshotRef.current=null;}}
            className="w-full bs-button py-3 text-sm font-semibold text-white/60 hover:text-white transition-colors">
            ← Create New Mix
          </button>
        </div>
      )}
    </div>
  );
}
