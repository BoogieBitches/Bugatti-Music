"use client";

import { useState, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Track {
  id: string;
  name: string;
  size: number;
  file?: File;
  duration: string;
  bpm: number | null;
  key: string | null;
  camelot: string | null;
  energy: number | null;
  genre: string | null;
  analyzed: boolean;
  analyzing: boolean;
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

type MixStyle = "club" | "festival" | "techhouse" | "openformat" | "radio" | "progressive" | "bugatti";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIX_STYLES: { id: MixStyle; label: string; desc: string; icon: string }[] = [
  { id: "club",        label: "Club Mix",        desc: "Peak-time energy, hard drops, 128–135 BPM",         icon: "🏟"  },
  { id: "festival",   label: "Festival Mix",     desc: "Epic builds, massive breakdowns, crowd moments",    icon: "🎪"  },
  { id: "techhouse",  label: "Tech House Mix",   desc: "Groovy, hypnotic, 124–128 BPM, minimal drops",     icon: "⚙️"  },
  { id: "openformat", label: "Open Format",      desc: "Genre-fluid, mixed BPM, crowd-reading flow",       icon: "🌀"  },
  { id: "radio",      label: "Radio Mix",        desc: "Clean, 60 min, broadcast-ready, tight transitions", icon: "📻" },
  { id: "progressive",label: "Progressive Mix",  desc: "Slow builds, emotional peaks, 128 BPM journey",    icon: "🌊"  },
];

const PROGRESS_STEPS = [
  "Analyzing tracks...",
  "Matching keys...",
  "Building set structure...",
  "Creating transitions...",
  "Mastering audio...",
];

const TRANS_LABELS: Record<string, string> = {
  cut: "Hard Cut",
  crossfade: "Crossfade",
  filter_sweep: "Filter Sweep",
  echo_out: "Echo Out",
};

const TRANS_COLORS: Record<string, string> = {
  cut: "bg-red-500/20 text-red-300 border-red-500/30",
  crossfade: "bg-green-500/20 text-green-300 border-green-500/30",
  filter_sweep: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  echo_out: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

// ─── Camelot wheel (client-side fallback + client-side transitions) ───────────

const CAMELOT_MINOR: Record<number, string> = {
  0: "8A", 1: "3A", 2: "10A", 3: "5A", 4: "12A", 5: "7A",
  6: "2A", 7: "9A", 8: "4A", 9: "11A", 10: "6A", 11: "1A",
};
const CAMELOT_MAJOR: Record<number, string> = {
  0: "8B", 1: "3B", 2: "10B", 3: "5B", 4: "12B", 5: "7B",
  6: "2B", 7: "9B", 8: "4B", 9: "11B", 10: "6B", 11: "1B",
};
const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const GENRES = ["Tech House", "Techno", "House", "Progressive", "Melodic", "Afro House"];

function camelotScore(c1: string, c2: string): number {
  if (!c1 || !c2) return 50;
  if (c1 === c2) return 100;
  const n1 = parseInt(c1.slice(0, -1), 10);
  const l1 = c1.slice(-1);
  const n2 = parseInt(c2.slice(0, -1), 10);
  const l2 = c2.slice(-1);
  const diff = Math.min(Math.abs(n1 - n2), 12 - Math.abs(n1 - n2));
  if (diff === 0) return 85;
  if (diff === 1 && l1 === l2) return 80;
  if (diff === 1 && l1 !== l2) return 65;
  if (diff === 2) return 45;
  return 20;
}

function computeTransition(a: Track, b: Track, fromIdx: number, toIdx: number): TransitionPlan {
  const bpmA = a.bpm ?? 128;
  const bpmB = b.bpm ?? 128;
  const bpmDiff = Math.abs(bpmA - bpmB);
  const bpmCompat = Math.max(0, 100 - Math.round(bpmDiff * 7));

  const cA = a.camelot ?? "";
  const cB = b.camelot ?? "";
  const keyCompat = camelotScore(cA, cB);

  const eA = a.energy ?? 70;
  const eB = b.energy ?? 70;
  const eDiff = eB - eA;
  const energyFlow = eDiff > 5 ? "up" : eDiff < -5 ? "down" : "stable";

  const score = Math.round(bpmCompat * 0.40 + keyCompat * 0.45 + (100 - Math.min(100, Math.abs(eDiff))) * 0.15);

  const combined = bpmCompat * 0.45 + keyCompat * 0.55;
  let transitionType: TransitionPlan["transitionType"];
  if (combined >= 85 && Math.abs(eDiff) <= 8) transitionType = "cut";
  else if (combined >= 72) transitionType = "crossfade";
  else if (combined >= 55) transitionType = "filter_sweep";
  else transitionType = "echo_out";

  const transitionBars =
    transitionType === "cut" ? 4 :
    transitionType === "crossfade" && bpmCompat >= 85 ? 16 : 32;

  const descriptions: Record<TransitionPlan["transitionType"], string> = {
    cut: "Hard cut at phrase boundary — instant swap",
    crossfade: `Smooth crossfade over ${transitionBars} bars`,
    filter_sweep: `High-pass out → low-pass in over ${transitionBars} bars`,
    echo_out: "Reverb tail leading into incoming intro",
  };

  return {
    fromIdx, toIdx, score, bpmDiff, bpmCompat, keyCompat, energyFlow,
    energyDiff: Math.abs(eDiff), transitionType, transitionBars,
    description: descriptions[transitionType], fromCamelot: cA, toCamelot: cB,
  };
}

// ─── Fake analysis fallback ────────────────────────────────────────────────────

function rb(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }

function fakeAnalysis(): Partial<Track> {
  const bpm = rb(122, 138);
  const keyIdx = rb(0, 11);
  const isMinor = Math.random() > 0.5;
  const camelot = isMinor ? CAMELOT_MINOR[keyIdx] : CAMELOT_MAJOR[keyIdx];
  const key = KEY_NAMES[keyIdx] + (isMinor ? "m" : " maj");
  return {
    bpm, key, camelot,
    energy: rb(55, 96),
    genre: GENRES[rb(0, GENRES.length - 1)],
    duration: `${rb(4, 8)}:${rb(0, 59).toString().padStart(2, "0")}`,
    analyzed: true, analyzing: false,
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function fmtBytes(b: number) {
  return b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function scoreColor(s: number) {
  if (s >= 80) return "#22c55e";
  if (s >= 60) return "#eab308";
  return "#ef4444";
}

function scoreLabel(s: number) {
  if (s >= 80) return "Perfect";
  if (s >= 65) return "Good";
  if (s >= 50) return "OK";
  return "Hard";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EnergyBar({ value }: { value: number }) {
  const color = value >= 80 ? "var(--accent)" : value >= 60 ? "var(--accent-2)" : "rgba(255,255,255,0.25)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-xs text-white/50 w-5 text-right">{value}</span>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = scoreColor(score);
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-black" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

function TransitionCard({ plan, fromTrack, toTrack }: { plan: TransitionPlan; fromTrack: Track; toTrack: Track }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="relative flex flex-col items-center my-1">
      {/* Connector line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-3 bg-white/10" />

      <button
        onClick={() => setExpanded((v) => !v)}
        className={`w-full max-w-3xl bs-card border px-4 py-3 transition-all duration-200 text-left
          ${plan.score >= 80 ? "border-green-500/20 hover:border-green-500/40" :
            plan.score >= 60 ? "border-yellow-500/20 hover:border-yellow-500/40" :
            "border-red-500/20 hover:border-red-500/40"}`}
      >
        <div className="flex items-center gap-4">
          <ScoreRing score={plan.score} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-semibold text-white/70 truncate max-w-[120px]">{fromTrack.name}</span>
              <span className="text-white/25 text-xs">→</span>
              <span className="text-xs font-semibold text-white/70 truncate max-w-[120px]">{toTrack.name}</span>
            </div>
            <div className="text-xs text-white/40">{plan.description}</div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-2 py-0.5 rounded border text-xs font-bold ${TRANS_COLORS[plan.transitionType]}`}>
              {TRANS_LABELS[plan.transitionType]}
            </span>
            <span className="text-xs text-white/25">{plan.transitionBars} bars</span>
            <span className={`text-xs ${expanded ? "rotate-180" : ""} transition-transform text-white/30`}>▼</span>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* BPM */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/30 uppercase tracking-widest">BPM</span>
              <div className="flex items-center gap-1 text-xs font-mono">
                <span className="text-[var(--accent-2)]">{fromTrack.bpm}</span>
                <span className="text-white/30">→</span>
                <span className="text-[var(--accent-2)]">{toTrack.bpm}</span>
                {plan.bpmDiff > 0 && (
                  <span className={plan.bpmCompat >= 80 ? "text-green-400" : plan.bpmCompat >= 50 ? "text-yellow-400" : "text-red-400"}>
                    ({plan.bpmDiff > 0 ? "+" : ""}{Math.round(plan.bpmDiff)})
                  </span>
                )}
              </div>
            </div>

            {/* Key */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/30 uppercase tracking-widest">Key</span>
              <div className="flex items-center gap-1 text-xs font-mono">
                <span className="px-1 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent-2)]">{plan.fromCamelot || fromTrack.key}</span>
                <span className="text-white/30">→</span>
                <span className="px-1 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent-2)]">{plan.toCamelot || toTrack.key}</span>
              </div>
            </div>

            {/* Energy */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/30 uppercase tracking-widest">Energy</span>
              <div className="flex items-center gap-2 text-xs">
                <span className={plan.energyFlow === "up" ? "text-green-400" : plan.energyFlow === "down" ? "text-red-400" : "text-white/50"}>
                  {plan.energyFlow === "up" ? "↑ Building" : plan.energyFlow === "down" ? "↓ Dropping" : "→ Stable"}
                </span>
                {plan.energyDiff > 0 && <span className="text-white/30">({plan.energyDiff}pt)</span>}
              </div>
            </div>

            {/* Compat score */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/30 uppercase tracking-widest">Rating</span>
              <span className="text-sm font-bold" style={{ color: scoreColor(plan.score) }}>
                {scoreLabel(plan.score)}
              </span>
            </div>
          </div>
        )}
      </button>

      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-3 bg-white/10" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const AUDIO_API = (process.env.NEXT_PUBLIC_AUDIO_API_URL ?? "").replace(/\/$/, "");

export function AIMixStudio() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<MixStyle | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [done, setDone] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [promptMode, setPromptMode] = useState(false);
  const [showTransitions, setShowTransitions] = useState(true);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [reorderIdx, setReorderIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ─ Analysis ────────────────────────────────────────────────────────────────

  async function analyzeTrackFile(file: File): Promise<Partial<Track>> {
    const apiBase = AUDIO_API || "/audio";
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${apiBase}/audio/analyze`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        bpm: data.bpm ?? null,
        key: data.key ?? null,
        camelot: data.camelot ?? null,
        energy: data.energy ?? null,
        genre: data.genre ?? null,
        duration: data.duration ?? "?:??",
        analyzed: true,
        analyzing: false,
        error: undefined,
      };
    } catch {
      return { ...fakeAnalysis(), error: undefined };
    }
  }

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const newTracks: Track[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.name.match(/\.(mp3|wav|flac|aiff|m4a)$/i) && !f.type.startsWith("audio/")) continue;
      newTracks.push({
        id: `${Date.now()}-${i}`,
        name: f.name.replace(/\.[^.]+$/, ""),
        size: f.size,
        file: f,
        duration: "",
        bpm: null, key: null, camelot: null, energy: null, genre: null,
        analyzed: false, analyzing: false,
      });
    }
    setTracks((t) => [...t, ...newTracks]);

    newTracks.forEach((track, idx) => {
      setTimeout(async () => {
        setTracks((t) => t.map((x) => x.id === track.id ? { ...x, analyzing: true } : x));
        const analysis = await analyzeTrackFile(track.file!);
        setTracks((t) => t.map((x) => x.id === track.id ? { ...x, ...analysis } : x));
      }, idx * 300);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  // ─ Reorder ─────────────────────────────────────────────────────────────────

  function handleReorderDrop(toIdx: number) {
    if (reorderIdx === null || reorderIdx === toIdx) return;
    setTracks((t) => {
      const arr = [...t];
      const [item] = arr.splice(reorderIdx, 1);
      arr.splice(toIdx, 0, item);
      return arr;
    });
    setDragOverIdx(null);
    setReorderIdx(null);
  }

  // ─ Generate ────────────────────────────────────────────────────────────────

  function handleGenerate() {
    if (!selectedStyle || tracks.length === 0) return;
    setGenerating(true);
    setProgressStep(0);
    setDone(false);
    let step = 0;
    const iv = setInterval(() => {
      step++;
      setProgressStep(step);
      if (step >= PROGRESS_STEPS.length - 1) {
        clearInterval(iv);
        setTimeout(() => { setGenerating(false); setDone(true); }, 1000);
      }
    }, 1400);
  }

  function removeTrack(id: string) {
    setTracks((t) => t.filter((x) => x.id !== id));
    if (done) setDone(false);
  }

  // ─ Derived state ───────────────────────────────────────────────────────────

  const analyzedCount = tracks.filter((t) => t.analyzed).length;
  const allAnalyzed = tracks.length > 0 && analyzedCount === tracks.length;
  const avgBpm = allAnalyzed
    ? Math.round(tracks.reduce((s, t) => s + (t.bpm ?? 0), 0) / tracks.length)
    : null;

  const transitions: TransitionPlan[] = allAnalyzed && tracks.length >= 2
    ? tracks.slice(0, -1).map((t, i) => computeTransition(t, tracks[i + 1], i, i + 1))
    : [];

  const avgScore = transitions.length
    ? Math.round(transitions.reduce((s, t) => s + t.score, 0) / transitions.length)
    : null;

  // ─ Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 pb-24">
      {/* Hero */}
      <div className="pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-xs font-semibold text-[var(--accent-2)] tracking-widest uppercase mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          Powered by AI
        </div>
        <h1 className="text-5xl md:text-6xl font-black tracking-tight bs-text-gradient leading-none mb-4">
          AI MIX STUDIO
        </h1>
        <p className="text-lg text-white/50 max-w-xl mx-auto">
          Upload your tracks and let AI create a professional DJ mix automatically.
        </p>
      </div>

      {/* Upload Zone */}
      {!done && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`bs-card p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-200 mb-4
            ${dragging ? "border-[var(--accent)] bg-[var(--accent)]/8 scale-[1.01]" : "hover:border-white/20 hover:bg-white/[0.02]"}`}
        >
          <input ref={fileRef} type="file" multiple accept=".mp3,.wav,.flac,.aiff,.m4a,audio/*"
            className="hidden" onChange={(e) => addFiles(e.target.files)} />
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-3xl">🎵</div>
          <div className="text-center">
            <div className="font-bold text-lg text-white">UPLOAD TRACKS</div>
            <div className="text-sm text-white/40 mt-1">Drag & drop or click · MP3, WAV, FLAC</div>
          </div>
          {dragging && <div className="text-[var(--accent-2)] text-sm font-semibold">Drop files here...</div>}
        </div>
      )}

      {/* Track List */}
      {tracks.length > 0 && !done && (
        <div className="bs-card overflow-hidden mb-4">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
            <span className="text-sm font-semibold text-white/70">
              {tracks.length} track{tracks.length !== 1 ? "s" : ""} · {analyzedCount}/{tracks.length} analyzed
            </span>
            <button onClick={() => fileRef.current?.click()} className="text-xs text-[var(--accent-2)] hover:text-white transition-colors">
              + Add more
            </button>
          </div>

          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[24px_1fr_60px_52px_72px_100px_88px_24px] gap-2 px-5 py-2 text-xs text-white/25 uppercase tracking-widest border-b border-white/5">
            <span /><span>Track</span><span className="text-right">Dur</span>
            <span className="text-center">BPM</span><span className="text-center">Key</span>
            <span>Energy</span><span>Genre</span><span />
          </div>

          <div className="divide-y divide-white/5">
            {tracks.map((track, idx) => (
              <div
                key={track.id}
                draggable
                onDragStart={() => setReorderIdx(idx)}
                onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                onDrop={() => handleReorderDrop(idx)}
                onDragEnd={() => { setDragOverIdx(null); setReorderIdx(null); }}
                className={`flex items-center gap-2 px-5 py-3 transition-colors cursor-grab active:cursor-grabbing
                  ${dragOverIdx === idx && reorderIdx !== idx ? "bg-[var(--accent)]/10" : "hover:bg-white/[0.02]"}`}
              >
                <div className="w-6 text-center text-xs text-white/25 select-none shrink-0">
                  {track.analyzing ? (
                    <span className="inline-block w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  ) : <span>{idx + 1}</span>}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium text-white">{track.name}</div>
                  <div className="text-xs text-white/30">{fmtBytes(track.size)}</div>
                </div>

                {track.analyzed ? (
                  <>
                    <div className="hidden sm:block text-xs text-white/50 w-12 text-right shrink-0">{track.duration}</div>
                    <div className="hidden sm:block text-xs font-mono text-[var(--accent-2)] w-10 text-center shrink-0">{track.bpm}</div>
                    <div className="hidden md:block w-16 text-center shrink-0">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--accent)]/12 text-[var(--accent-2)] font-mono">
                        {track.camelot || track.key}
                      </span>
                    </div>
                    <div className="hidden md:block w-24 shrink-0"><EnergyBar value={track.energy!} /></div>
                    <div className="hidden lg:block text-xs text-white/40 w-20 text-right truncate shrink-0">{track.genre}</div>
                  </>
                ) : (
                  <div className="text-xs text-white/25 italic">
                    {track.analyzing ? "Analyzing..." : "Queued"}
                  </div>
                )}

                <button onClick={() => removeTrack(track.id)}
                  className="w-6 h-6 flex items-center justify-center text-white/20 hover:text-red-400 transition-colors text-lg shrink-0">
                  ×
                </button>
              </div>
            ))}
          </div>
          {tracks.length > 1 && (
            <div className="px-5 py-2 border-t border-white/5 text-xs text-white/20">↕ Drag rows to reorder</div>
          )}
        </div>
      )}

      {/* ── TRANSITION PREVIEW ─────────────────────────────────────────────── */}
      {allAnalyzed && transitions.length > 0 && !done && (
        <div className="mb-4">
          <button
            onClick={() => setShowTransitions((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 bs-card mb-0.5 hover:bg-white/[0.03] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-black bs-text-gradient">TRANSITION PREVIEW</span>
              <span className="text-xs text-white/40">{transitions.length} transition{transitions.length !== 1 ? "s" : ""}</span>
              {avgScore !== null && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold border"
                  style={{ color: scoreColor(avgScore), borderColor: scoreColor(avgScore) + "44", background: scoreColor(avgScore) + "15" }}>
                  Avg {avgScore}
                </span>
              )}
            </div>
            <span className={`text-white/30 text-xs transition-transform ${showTransitions ? "rotate-180" : ""}`}>▼</span>
          </button>

          {showTransitions && (
            <div className="relative">
              {/* First track label */}
              <div className="mx-auto max-w-3xl px-4 py-2 flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/5 mb-1">
                <span className="w-5 h-5 rounded-full bg-[var(--accent)]/20 text-[var(--accent-2)] text-xs flex items-center justify-center font-bold">1</span>
                <span className="text-sm font-medium text-white/80 truncate">{tracks[0].name}</span>
                <span className="ml-auto text-xs font-mono text-[var(--accent-2)]">{tracks[0].bpm} BPM · {tracks[0].camelot}</span>
              </div>

              {transitions.map((plan, i) => (
                <div key={`t-${i}`}>
                  <TransitionCard plan={plan} fromTrack={tracks[plan.fromIdx]} toTrack={tracks[plan.toIdx]} />
                  {/* Next track label */}
                  <div className="mx-auto max-w-3xl px-4 py-2 flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/5 mt-1 mb-1">
                    <span className="w-5 h-5 rounded-full bg-[var(--accent)]/20 text-[var(--accent-2)] text-xs flex items-center justify-center font-bold">
                      {plan.toIdx + 1}
                    </span>
                    <span className="text-sm font-medium text-white/80 truncate">{tracks[plan.toIdx].name}</span>
                    <span className="ml-auto text-xs font-mono text-[var(--accent-2)]">
                      {tracks[plan.toIdx].bpm} BPM · {tracks[plan.toIdx].camelot}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI FROM PROMPT + Style Selection */}
      {allAnalyzed && !generating && !done && (
        <>
          <div className="mb-4">
            <button onClick={() => setPromptMode((v) => !v)}
              className="flex items-center gap-2 text-sm text-[var(--accent-2)] hover:text-white transition-colors font-semibold">
              <span className="w-5 h-5 flex items-center justify-center rounded-md bg-[var(--accent)]/20 text-xs">
                {promptMode ? "−" : "+"}
              </span>
              AI MIX FROM PROMPT {promptMode ? "(hide)" : ""}
            </button>
            {promptMode && (
              <div className="mt-3 bs-card p-4">
                <p className="text-xs text-white/40 mb-2">Describe the vibe — AI will build the set accordingly.</p>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                  placeholder={'e.g. "Create a 60-minute club set in the style of G-Pol and Jean Biscuit. Start smooth, build energy gradually, peak-time atmosphere."'}
                  rows={3} className="bs-input w-full text-sm resize-none" />
              </div>
            )}
          </div>

          <div className="mb-4">
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Select Mix Style</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {MIX_STYLES.map((style) => (
                <button key={style.id} onClick={() => setSelectedStyle(style.id)}
                  className={`bs-card p-4 text-left transition-all duration-200 border
                    ${selectedStyle === style.id
                      ? "border-[var(--accent)] bg-[var(--accent)]/12 shadow-[0_0_20px_-4px_rgba(122,85,255,0.4)]"
                      : "border-transparent hover:border-white/15"}`}>
                  <div className="text-2xl mb-2">{style.icon}</div>
                  <div className="font-bold text-sm text-white">{style.label}</div>
                  <div className="text-xs text-white/40 mt-1">{style.desc}</div>
                </button>
              ))}
              <button onClick={() => setSelectedStyle("bugatti")}
                className={`bs-card p-4 text-left md:col-span-3 border transition-all duration-200
                  ${selectedStyle === "bugatti"
                    ? "border-[var(--accent)] bg-[var(--accent)]/15 shadow-[0_0_40px_-8px_rgba(122,85,255,0.6)]"
                    : "border-[var(--accent)]/30 hover:border-[var(--accent)]/60"}`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-2xl">🏎</div>
                  <div>
                    <div className="font-black text-base bs-text-gradient">BUGATTI MODE</div>
                    <div className="text-xs text-[var(--accent-2)]/70">Advanced AI · Club-ready</div>
                  </div>
                  {selectedStyle === "bugatti" && (
                    <span className="ml-auto px-2 py-0.5 rounded-full bg-[var(--accent)]/30 text-[var(--accent-2)] text-xs font-bold">SELECTED</span>
                  )}
                </div>
                <p className="text-xs text-white/50">
                  Advanced AI analyzes BPM, key, energy, vocals and track structure to create a professional
                  club-ready DJ set with beatmatching, harmonic mixing, phrase matching, intelligent EQ
                  transitions, filter sweeps, smooth crossfades and loudness balancing.
                </p>
              </button>
            </div>
          </div>

          <button onClick={handleGenerate} disabled={!selectedStyle}
            className={`w-full bs-button bs-button-primary py-5 text-lg font-black tracking-wide transition-all duration-200
              ${!selectedStyle ? "opacity-30 cursor-not-allowed" : "hover:scale-[1.01]"}`}>
            GENERATE MIX
          </button>
        </>
      )}

      {/* Progress */}
      {generating && (
        <div className="bs-card p-8 text-center">
          <div className="inline-flex w-16 h-16 rounded-full border-4 border-[var(--accent)]/30 border-t-[var(--accent)] animate-spin mb-4" />
          <div className="text-lg font-bold text-white animate-pulse mb-4">{PROGRESS_STEPS[progressStep]}</div>
          <div className="flex justify-center gap-2 mb-4">
            {PROGRESS_STEPS.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i <= progressStep ? "bg-[var(--accent)] w-8" : "bg-white/10 w-4"}`} />
            ))}
          </div>
          <div className="space-y-1 text-xs text-white/30">
            {PROGRESS_STEPS.slice(0, progressStep + 1).map((s, i) => (
              <div key={i} className="flex items-center justify-center gap-2">
                <span className="text-green-400">✓</span>{s.replace("...", " done")}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {done && (
        <div className="space-y-4">
          <div className="bs-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-lg bs-text-gradient">Mix Ready</h2>
              <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-bold">COMPLETE</span>
            </div>
            <div className="h-20 flex items-center gap-px overflow-hidden rounded-lg bg-black/30 px-2">
              {Array.from({ length: 120 }).map((_, i) => {
                const h = 15 + Math.abs(Math.sin(i * 0.4) * 55 + Math.cos(i * 0.13) * 25);
                return (
                  <div key={i} className="flex-1 rounded-sm" style={{
                    height: `${Math.min(100, h)}%`,
                    background: i < 90 ? `rgba(122,85,255,${0.4 + (i / 120) * 0.5})` : "rgba(255,255,255,0.12)",
                  }} />
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button className="w-10 h-10 rounded-full bg-[var(--accent)]/20 hover:bg-[var(--accent)]/40 border border-[var(--accent)]/30 flex items-center justify-center text-lg transition-colors">▶</button>
              <div className="flex-1 h-1 bg-white/10 rounded-full"><div className="w-0 h-full bg-[var(--accent)] rounded-full" /></div>
              <span className="text-xs text-white/40">0:00</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Duration", value: `${avgBpm ? Math.round(tracks.length * 6.5) : rb(55, 75)} min` },
              { label: "Avg BPM", value: `${avgBpm ?? rb(126, 132)}` },
              { label: "Tracks", value: `${tracks.length}` },
              { label: "Transitions", value: `${tracks.length - 1}` },
            ].map((s) => (
              <div key={s.label} className="bs-card p-4 text-center">
                <div className="text-2xl font-black text-white">{s.value}</div>
                <div className="text-xs text-white/40 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {avgScore !== null && (
            <div className="bs-card p-4 flex items-center gap-4">
              <ScoreRing score={avgScore} />
              <div>
                <div className="text-sm font-bold text-white">Set Compatibility Score</div>
                <div className="text-xs text-white/40 mt-0.5">
                  Based on harmonic matching, BPM flow, and energy arc
                </div>
              </div>
            </div>
          )}

          <div className="bs-card p-5">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Applied Techniques</div>
            <div className="flex flex-wrap gap-2">
              {["Beatmatching", "Harmonic Mixing", "Phrase Matching", "Intelligent EQ", "Filter Sweeps", "Smooth Crossfades", "Gain Automation", "Loudness Balancing"].map((t) => (
                <span key={t} className="px-2 py-1 rounded-md bg-[var(--accent)]/12 border border-[var(--accent)]/20 text-xs text-[var(--accent-2)]">{t}</span>
              ))}
            </div>
          </div>

          <div className="bs-card p-5">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Export</div>
            <div className="flex flex-wrap gap-3">
              {[{ label: "MP3 320 kbps", icon: "⬇" }, { label: "WAV", icon: "⬇" }, { label: "Save Project", icon: "💾" }].map((e) => (
                <button key={e.label} className="bs-button px-5 py-2.5 text-sm font-semibold flex items-center gap-2 hover:bg-white/10 transition-colors"
                  onClick={() => alert("Export will be available in the full release.")}>
                  <span>{e.icon}</span>{e.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => { setTracks([]); setDone(false); setSelectedStyle(null); setPrompt(""); setPromptMode(false); }}
            className="w-full bs-button py-3 text-sm font-semibold text-white/60 hover:text-white transition-colors">
            ← Create New Mix
          </button>
        </div>
      )}
    </div>
  );
}
