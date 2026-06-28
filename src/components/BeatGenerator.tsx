"use client";

import { useState, useRef, useEffect } from "react";

const RAILWAY_URL = "https://vivacious-celebration-production-9ee8.up.railway.app";

const GENRES = [
  { label: "Hip-Hop", prompt: "hip hop beat, boom bap, 90 bpm, dark, heavy bass" },
  { label: "Trap", prompt: "trap beat, 140 bpm, 808 bass, hi-hats, dark atmosphere" },
  { label: "Phonk", prompt: "phonk, dark, aggressive, 140 bpm, memphis style, distorted 808" },
  { label: "Drill", prompt: "uk drill beat, 140 bpm, dark, sliding 808, off-beat hi-hats" },
  { label: "House", prompt: "deep house beat, 124 bpm, soulful chords, four on the floor" },
  { label: "Tech House", prompt: "tech house groove, 126 bpm, minimal, hypnotic, punchy kick" },
  { label: "Techno", prompt: "techno beat, 132 bpm, industrial, relentless kick, dark atmosphere" },
  { label: "Lo-fi", prompt: "lofi hip hop, chill, 80 bpm, jazzy chords, vinyl crackle, relaxing" },
  { label: "Afrobeat", prompt: "afrobeat, 100 bpm, percussive, groovy, warm bass" },
  { label: "Amapiano", prompt: "amapiano, 112 bpm, log drum, piano riffs, south african groove" },
];

const DURATIONS = [
  { value: 30,  label: "30 сек",  note: "~1 мин" },
  { value: 60,  label: "1 мин",   note: "~2 мин" },
  { value: 90,  label: "1.5 мин", note: "~3 мин" },
  { value: 120, label: "2 мин",   note: "~4 мин" },
];

interface JobStatus {
  status: "queued" | "running" | "done" | "error";
  progress: number;
  message: string;
}

export function BeatGenerator() {
  const [prompt, setPrompt]       = useState("");
  const [duration, setDuration]   = useState(30);
  const [loading, setLoading]     = useState(false);
  const [progress, setProgress]   = useState(0);
  const [message, setMessage]     = useState("");
  const [jobId, setJobId]         = useState<string | null>(null);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [audioUrl, setAudioUrl]   = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setLoading(false);
    setProgress(0);
    setMessage("");
    setJobId(null);
    setDone(false);
    setError(null);
    setAudioUrl(null);
  }

  function applyGenre(g: typeof GENRES[number]) {
    setPrompt(g.prompt);
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;
    reset();
    setLoading(true);
    setProgress(5);
    setMessage("Отправляем запрос…");

    try {
      const res = await fetch(`${RAILWAY_URL}/audio/musicgen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), duration }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const { job_id } = await res.json();
      setJobId(job_id);
      startPolling(job_id);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Ошибка запроса");
    }
  }

  function startPolling(jid: string) {
    let fails = 0;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${RAILWAY_URL}/audio/jobs/${jid}`);
        if (res.status === 404) {
          clearInterval(pollRef.current!);
          setLoading(false);
          setError("Задача не найдена — сервер перезагрузился. Попробуй снова.");
          return;
        }
        if (!res.ok) {
          if (++fails >= 8) {
            clearInterval(pollRef.current!);
            setLoading(false);
            setError(`Сервер недоступен (HTTP ${res.status})`);
          }
          return;
        }
        fails = 0;
        const data: JobStatus = await res.json();
        setProgress(data.progress);
        setMessage(data.message);

        if (data.status === "done") {
          clearInterval(pollRef.current!);
          setLoading(false);
          setDone(true);
        } else if (data.status === "error") {
          clearInterval(pollRef.current!);
          setLoading(false);
          setError(data.message || "Ошибка генерации");
        }
      } catch {
        /* network glitch, retry */
      }
    }, 2000);
  }

  const downloadUrl = jobId
    ? `${RAILWAY_URL}/audio/musicgen/${jobId}/download`
    : null;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="text-3xl">🎹</div>
        <h2 className="text-xl font-black text-white tracking-tight">Beat Generator</h2>
        <p className="text-sm text-white/40">
          Опиши звук — AI сгенерирует инструментал за 30–90 сек
        </p>
      </div>

      {!loading && !done && (
        <>
          {/* Genre quick-select */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-widest">
              Быстрый выбор жанра
            </div>
            <div className="flex flex-wrap gap-2">
              {GENRES.map(g => (
                <button
                  key={g.label}
                  onClick={() => applyGenre(g)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all duration-150
                    ${prompt === g.prompt
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent-2)]"
                      : "border-white/15 bg-white/5 text-white/60 hover:border-white/30 hover:text-white"}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-widest">
              Описание звука
            </div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={3}
              placeholder="hip hop beat, dark, heavy 808 bass, 90 bpm, moody atmosphere…"
              className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-sm text-white
                placeholder-white/25 focus:outline-none focus:border-[var(--accent)] resize-none
                transition-colors duration-150"
            />
            <div className="text-xs text-white/25 text-right">{prompt.length}/200</div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-widest">
              Длина клипа
            </div>
            <div className="flex gap-2">
              {DURATIONS.map(d => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={`flex-1 py-2 px-1 rounded-lg border text-xs font-bold transition-all duration-150
                    flex flex-col items-center gap-0.5
                    ${duration === d.value
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent-2)]"
                      : "border-white/15 bg-white/5 text-white/50 hover:border-white/30 hover:text-white"}`}
                >
                  <span className="font-black">{d.label}</span>
                  <span className={`text-[10px] ${duration === d.value ? "text-[var(--accent)]/70" : "text-white/25"}`}>
                    ожидание {d.note}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-900/20 border border-red-500/30 text-sm text-red-300">
              ⚠ {error}
            </div>
          )}

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim()}
            className="w-full py-5 rounded-xl text-base font-black tracking-wide transition-all duration-200
              hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-2))", color: "#000" }}
          >
            СГЕНЕРИРОВАТЬ БИТ ✦
          </button>

          <p className="text-center text-xs text-white/20">
            Meta MusicGen Small · Бесплатно · длинные треки склеиваются из частей
          </p>
        </>
      )}

      {/* Progress */}
      {loading && (
        <div className="bs-card p-8 text-center space-y-4">
          <div className="inline-flex w-16 h-16 rounded-full border-4 border-[var(--accent)]/30 border-t-[var(--accent)] animate-spin" />
          <div>
            <div className="text-base font-bold text-white mb-1">{message || "Обработка…"}</div>
            <div className="text-xs text-white/30">{progress}%</div>
          </div>
          <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-white/20">
            Модель генерирует аудио на серверах HuggingFace — это займёт некоторое время
          </p>
        </div>
      )}

      {/* Result */}
      {done && downloadUrl && (
        <div className="space-y-4">
          <div className="bs-card p-5 space-y-4">
            <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
              <span>✓</span>
              <span>Бит готов</span>
            </div>

            <audio
              controls
              src={downloadUrl}
              className="w-full"
              style={{ accentColor: "var(--accent)" }}
            />

            <div className="flex gap-3">
              <a
                href={downloadUrl}
                download={`bugatti-beat-${jobId?.slice(0, 8)}.wav`}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-center transition-all
                  hover:scale-[1.02] border border-[var(--accent)]/40 text-[var(--accent-2)]
                  hover:bg-[var(--accent)]/10"
              >
                ↓ Скачать WAV
              </a>
              <button
                onClick={reset}
                className="flex-1 py-3 rounded-xl text-sm font-bold border border-white/15
                  text-white/60 hover:text-white hover:border-white/30 transition-all"
              >
                ← Новый бит
              </button>
            </div>
          </div>

          <div className="bs-card p-4 text-xs text-white/30 space-y-1">
            <div className="font-semibold text-white/40 uppercase tracking-widest mb-2">Промпт</div>
            <div className="italic">«{prompt}»</div>
            <div className="mt-2">Длина: {duration} сек · Модель: MusicGen Small (Meta)</div>
          </div>
        </div>
      )}
    </div>
  );
}
