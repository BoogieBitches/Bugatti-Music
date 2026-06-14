"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface Track {
  id: string;
  name: string;
  size: number;
  duration: string;
  bpm: number | null;
  key: string | null;
  energy: number | null;
  genre: string | null;
  analyzed: boolean;
}

type MixStyle = "club" | "festival" | "techhouse" | "openformat" | "radio" | "progressive" | "bugatti";

const MIX_STYLES: { id: MixStyle; label: string; desc: string; icon: string }[] = [
  { id: "club", label: "Club Mix", desc: "Peak-time energy, hard drops, 128–135 BPM", icon: "🏟" },
  { id: "festival", label: "Festival Mix", desc: "Epic builds, massive breakdowns, crowd moments", icon: "🎪" },
  { id: "techhouse", label: "Tech House Mix", desc: "Groovy, hypnotic, 124–128 BPM, minimal drops", icon: "⚙️" },
  { id: "openformat", label: "Open Format", desc: "Genre-fluid, mixed BPM, crowd-reading flow", icon: "🌀" },
  { id: "radio", label: "Radio Mix", desc: "Clean, 60 min, broadcast-ready, tight transitions", icon: "📻" },
  { id: "progressive", label: "Progressive Mix", desc: "Slow builds, emotional peaks, 128 BPM journey", icon: "🌊" },
];

const PROGRESS_STEPS = [
  "Analyzing tracks...",
  "Matching keys...",
  "Building set structure...",
  "Creating transitions...",
  "Mastering audio...",
];

const KEYS = ["Am", "Bm", "Cm", "Dm", "Em", "Fm", "Gm", "C maj", "D maj", "F maj", "G maj", "A maj"];
const GENRES = ["Tech House", "Techno", "House", "Progressive", "Melodic", "Afro House", "Minimal"];

function randomBetween(a: number, b: number) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
function fakeAnalyze(name: string): Omit<Track, "id" | "name" | "size" | "analyzed"> {
  const bpm = randomBetween(122, 138);
  const key = KEYS[randomBetween(0, KEYS.length - 1)];
  const energy = randomBetween(55, 98);
  const genre = GENRES[randomBetween(0, GENRES.length - 1)];
  const min = randomBetween(4, 8);
  const sec = randomBetween(0, 59);
  return { bpm, key, energy, genre, duration: `${min}:${sec.toString().padStart(2, "0")}` };
}

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function EnergyBar({ value }: { value: number }) {
  const color = value >= 80 ? "#7a55ff" : value >= 60 ? "#b89dff" : "#ffffff44";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
      <span className="text-xs text-white/50 w-6 text-right">{value}</span>
    </div>
  );
}

export function AIMixStudio() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<MixStyle | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [done, setDone] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [promptMode, setPromptMode] = useState(false);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [reorderIdx, setReorderIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const allowed = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac", "audio/x-flac", "audio/mp3"];
    const newTracks: Track[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.type.startsWith("audio/") && !f.name.match(/\.(mp3|wav|flac)$/i)) continue;
      newTracks.push({
        id: `${Date.now()}-${i}`,
        name: f.name.replace(/\.[^.]+$/, ""),
        size: f.size,
        duration: null as unknown as string,
        bpm: null,
        key: null,
        energy: null,
        genre: null,
        analyzed: false,
      });
    }
    setTracks((t) => [...t, ...newTracks]);
    // Simulate analysis per track sequentially
    newTracks.forEach((track, idx) => {
      setTimeout(() => {
        setAnalyzing(track.id);
        setTimeout(() => {
          const analysis = fakeAnalyze(track.name);
          setTracks((t) =>
            t.map((x) =>
              x.id === track.id ? { ...x, ...analysis, analyzed: true } : x
            )
          );
          setAnalyzing(null);
        }, 900 + randomBetween(200, 600));
      }, idx * 1200);
    });
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

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
        setTimeout(() => {
          setGenerating(false);
          setDone(true);
        }, 1000);
      }
    }, 1400);
  }

  function removeTrack(id: string) {
    setTracks((t) => t.filter((x) => x.id !== id));
    if (done) setDone(false);
  }

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

  const analyzedCount = tracks.filter((t) => t.analyzed).length;
  const allAnalyzed = tracks.length > 0 && analyzedCount === tracks.length;
  const avgBpm = allAnalyzed
    ? Math.round(tracks.reduce((s, t) => s + (t.bpm ?? 0), 0) / tracks.length)
    : null;

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
          className={`bs-card p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-200 mb-6
            ${dragging ? "border-[var(--accent)] bg-[var(--accent)]/8 scale-[1.01]" : "hover:border-white/20 hover:bg-white/[0.02]"}`}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".mp3,.wav,.flac,audio/*"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-3xl">
            🎵
          </div>
          <div className="text-center">
            <div className="font-bold text-lg text-white">UPLOAD TRACKS</div>
            <div className="text-sm text-white/40 mt-1">Drag & drop or click • MP3, WAV, FLAC</div>
          </div>
          {dragging && (
            <div className="text-[var(--accent-2)] text-sm font-semibold">Drop files here...</div>
          )}
        </div>
      )}

      {/* Track List */}
      {tracks.length > 0 && !done && (
        <div className="bs-card overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
            <span className="text-sm font-semibold text-white/70">
              {tracks.length} track{tracks.length !== 1 ? "s" : ""} • {analyzedCount}/{tracks.length} analyzed
            </span>
            <button
              onClick={() => fileRef.current?.click()}
              className="text-xs text-[var(--accent-2)] hover:text-white transition-colors"
            >
              + Add more
            </button>
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
                className={`flex items-center gap-4 px-5 py-3 transition-colors
                  ${dragOverIdx === idx && reorderIdx !== idx ? "bg-[var(--accent)]/10" : "hover:bg-white/[0.02]"}
                  cursor-grab active:cursor-grabbing`}
              >
                {/* Index / drag handle */}
                <div className="w-6 text-center text-xs text-white/25 select-none">
                  {analyzing === track.id ? (
                    <span className="inline-block w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>

                {/* Name + size */}
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium text-white">{track.name}</div>
                  <div className="text-xs text-white/30">{formatBytes(track.size)}</div>
                </div>

                {track.analyzed ? (
                  <>
                    <div className="hidden sm:block text-xs text-white/50 w-12 text-right">{track.duration}</div>
                    <div className="hidden sm:block text-xs font-mono text-[var(--accent-2)] w-10 text-center">{track.bpm}</div>
                    <div className="hidden md:block text-xs text-white/60 w-14 text-center">{track.key}</div>
                    <div className="hidden md:block w-24">
                      <EnergyBar value={track.energy!} />
                    </div>
                    <div className="hidden lg:block text-xs text-white/40 w-20 text-right">{track.genre}</div>
                  </>
                ) : (
                  <div className="text-xs text-white/25 italic">
                    {analyzing === track.id ? "Analyzing..." : "Queued"}
                  </div>
                )}

                <button
                  onClick={() => removeTrack(track.id)}
                  className="w-6 h-6 flex items-center justify-center text-white/20 hover:text-red-400 transition-colors text-lg"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {tracks.length > 1 && (
            <div className="px-5 py-2 border-t border-white/5 text-xs text-white/25">
              ↕ Drag rows to reorder tracks
            </div>
          )}
        </div>
      )}

      {/* AI FROM PROMPT + Style Selection */}
      {allAnalyzed && !generating && !done && (
        <>
          {/* Prompt toggle */}
          <div className="mb-4">
            <button
              onClick={() => setPromptMode((v) => !v)}
              className="flex items-center gap-2 text-sm text-[var(--accent-2)] hover:text-white transition-colors font-semibold"
            >
              <span className="w-5 h-5 flex items-center justify-center rounded-md bg-[var(--accent)]/20 text-xs">
                {promptMode ? "−" : "+"}
              </span>
              AI MIX FROM PROMPT {promptMode ? "(hide)" : ""}
            </button>
            {promptMode && (
              <div className="mt-3 bs-card p-4">
                <p className="text-xs text-white/40 mb-2">
                  Describe the vibe — AI will build the set accordingly.
                </p>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={'e.g. "Create a 60-minute club set in the style of G-Pol and Jean Biscuit. Start smooth, build energy gradually, peak-time atmosphere."'}
                  rows={3}
                  className="bs-input w-full text-sm resize-none"
                />
              </div>
            )}
          </div>

          {/* Style Grid */}
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-3">
              Select Mix Style
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {MIX_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`bs-card p-4 text-left transition-all duration-200 border
                    ${selectedStyle === style.id
                      ? "border-[var(--accent)] bg-[var(--accent)]/12 shadow-[0_0_20px_-4px_rgba(122,85,255,0.4)]"
                      : "border-transparent hover:border-white/15"
                    }`}
                >
                  <div className="text-2xl mb-2">{style.icon}</div>
                  <div className="font-bold text-sm text-white">{style.label}</div>
                  <div className="text-xs text-white/40 mt-1">{style.desc}</div>
                </button>
              ))}

              {/* BUGATTI MODE */}
              <button
                onClick={() => setSelectedStyle("bugatti")}
                className={`bs-card p-4 text-left md:col-span-3 border transition-all duration-200
                  ${selectedStyle === "bugatti"
                    ? "border-[var(--accent)] bg-[var(--accent)]/15 shadow-[0_0_40px_-8px_rgba(122,85,255,0.6)]"
                    : "border-[var(--accent)]/30 hover:border-[var(--accent)]/60"
                  }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-2xl">🏎</div>
                  <div>
                    <div className="font-black text-base bs-text-gradient">BUGATTI MODE</div>
                    <div className="text-xs text-[var(--accent-2)]/70">Advanced AI • Club-ready</div>
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

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!selectedStyle}
            className={`w-full bs-button bs-button-primary py-5 text-lg font-black tracking-wide transition-all duration-200
              ${!selectedStyle ? "opacity-30 cursor-not-allowed" : "hover:scale-[1.01]"}`}
          >
            GENERATE MIX
          </button>
        </>
      )}

      {/* Progress */}
      {generating && (
        <div className="bs-card p-8 text-center">
          <div className="mb-6">
            <div className="inline-flex w-16 h-16 rounded-full border-4 border-[var(--accent)]/30 border-t-[var(--accent)] animate-spin mb-4" />
            <div className="text-lg font-bold text-white animate-pulse">
              {PROGRESS_STEPS[progressStep]}
            </div>
          </div>
          <div className="flex justify-center gap-2 mb-4">
            {PROGRESS_STEPS.map((s, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i <= progressStep
                    ? "bg-[var(--accent)] w-8"
                    : "bg-white/10 w-4"
                }`}
              />
            ))}
          </div>
          <div className="space-y-1 text-xs text-white/30 mt-4">
            {PROGRESS_STEPS.slice(0, progressStep + 1).map((s, i) => (
              <div key={i} className="flex items-center justify-center gap-2">
                <span className="text-green-400">✓</span> {s.replace("...", " done")}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Done / Result */}
      {done && (
        <div className="space-y-4">
          {/* Waveform */}
          <div className="bs-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-lg bs-text-gradient">Mix Ready</h2>
              <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-bold">COMPLETE</span>
            </div>
            {/* Fake waveform */}
            <div className="h-20 flex items-center gap-px overflow-hidden rounded-lg bg-black/30 px-2">
              {Array.from({ length: 120 }).map((_, i) => {
                const h = 15 + Math.abs(Math.sin(i * 0.4) * 55 + Math.cos(i * 0.13) * 25);
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{
                      height: `${Math.min(100, h)}%`,
                      background: i < 90
                        ? `rgba(122,85,255,${0.4 + (i / 120) * 0.5})`
                        : "rgba(255,255,255,0.12)",
                    }}
                  />
                );
              })}
            </div>
            {/* Controls */}
            <div className="flex items-center gap-3 mt-4">
              <button className="w-10 h-10 rounded-full bg-[var(--accent)]/20 hover:bg-[var(--accent)]/40 border border-[var(--accent)]/30 flex items-center justify-center text-lg transition-colors">
                ▶
              </button>
              <div className="flex-1 h-1 bg-white/10 rounded-full">
                <div className="w-0 h-full bg-[var(--accent)] rounded-full" />
              </div>
              <span className="text-xs text-white/40">0:00</span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Duration", value: `${randomBetween(55, 75)} min` },
              { label: "Avg BPM", value: `${avgBpm ?? randomBetween(126, 132)}` },
              { label: "Tracks", value: `${tracks.length}` },
              { label: "Transitions", value: `${tracks.length - 1}` },
            ].map((s) => (
              <div key={s.label} className="bs-card p-4 text-center">
                <div className="text-2xl font-black text-white">{s.value}</div>
                <div className="text-xs text-white/40 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Mix features */}
          <div className="bs-card p-5">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Applied Techniques</div>
            <div className="flex flex-wrap gap-2">
              {["Beatmatching", "Harmonic Mixing", "Phrase Matching", "Intelligent EQ", "Filter Sweeps", "Smooth Crossfades", "Gain Automation", "Loudness Balancing"].map((t) => (
                <span key={t} className="px-2 py-1 rounded-md bg-[var(--accent)]/12 border border-[var(--accent)]/20 text-xs text-[var(--accent-2)]">
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Export */}
          <div className="bs-card p-5">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Export</div>
            <div className="flex flex-wrap gap-3">
              {[
                { label: "MP3 320 kbps", icon: "⬇" },
                { label: "WAV", icon: "⬇" },
                { label: "Save Project", icon: "💾" },
              ].map((e) => (
                <button
                  key={e.label}
                  className="bs-button px-5 py-2.5 text-sm font-semibold flex items-center gap-2 hover:bg-white/10 transition-colors"
                  onClick={() => alert("Export will be available in the full release.")}
                >
                  <span>{e.icon}</span>
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* New mix */}
          <button
            onClick={() => { setTracks([]); setDone(false); setSelectedStyle(null); setPrompt(""); setPromptMode(false); }}
            className="w-full bs-button py-3 text-sm font-semibold text-white/60 hover:text-white transition-colors"
          >
            ← Create New Mix
          </button>
        </div>
      )}
    </div>
  );
}
