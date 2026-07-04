"use client";

import { useState, useRef, useCallback } from "react";

const RAILWAY_URL = "https://bugattimusic-bugatti-stems.hf.space";

const MAX_MB = 50;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const STEMS = [
  { key: "vocals", label: "Вокал",     icon: "🎤", grad: "from-pink-500/20 to-purple-500/20",   border: "border-pink-500/40" },
  { key: "drums",  label: "Барабаны",  icon: "🥁", grad: "from-orange-500/20 to-red-500/20",    border: "border-orange-500/40" },
  { key: "bass",   label: "Бас",       icon: "🎸", grad: "from-blue-500/20 to-cyan-500/20",     border: "border-blue-500/40" },
  { key: "other",  label: "Мелодия",   icon: "🎹", grad: "from-green-500/20 to-emerald-500/20", border: "border-green-500/40" },
];

interface JobStatus {
  status: "queued" | "running" | "done" | "error";
  progress: number;
  message: string;
}

export function StemSplitter() {
  const [file, setFile]           = useState<File | null>(null);
  const [sizeError, setSizeError] = useState(false);
  const [dragging, setDragging]   = useState(false);
  const [jobId, setJobId]         = useState<string | null>(null);
  const [job, setJob]             = useState<JobStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const pollRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pickFile = useCallback((f: File) => {
    if (f.size > MAX_BYTES) {
      setSizeError(true);
      setFile(null);
    } else {
      setSizeError(false);
      setFile(f);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }, [pickFile]);

  const poll = useCallback((id: string) => {
    pollRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${RAILWAY_URL}/audio/jobs/${id}`);
        if (!r.ok) throw new Error(await r.text());
        const data: JobStatus = await r.json();
        setJob(data);
        if (data.status === "running" || data.status === "queued") {
          poll(id);
        }
      } catch (err) {
        setJob({ status: "error", progress: 0, message: String(err) });
      }
    }, 3000);
  }, []);

  const start = async () => {
    if (!file) return;
    setUploading(true);
    setJob(null);
    setJobId(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${RAILWAY_URL}/audio/stems`, { method: "POST", body: fd });
      if (!r.ok) throw new Error(await r.text());
      const { job_id } = await r.json();
      setJobId(job_id);
      setJob({ status: "queued", progress: 0, message: "В очереди…" });
      poll(job_id);
    } catch (err) {
      setJob({ status: "error", progress: 0, message: String(err) });
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setFile(null); setJobId(null); setJob(null); setUploading(false); setSizeError(false);
  };

  const stemUrl = (stem: string) => `${RAILWAY_URL}/audio/stems/${jobId}/${stem}`;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black tracking-tight">🎛 Stem Splitter</h2>
        <p className="text-white/50 text-sm">Разделить трек на вокал, барабаны, бас и мелодию</p>
      </div>

      {/* Upload zone */}
      {!job && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200
            ${dragging ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-white/20 hover:border-white/40 hover:bg-white/5"}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.flac,.aac,.ogg,.m4a"
            className="hidden"
            onChange={e => e.target.files?.[0] && pickFile(e.target.files[0])}
          />
          {file ? (
            <div className="space-y-2">
              <div className="text-4xl">🎵</div>
              <p className="font-bold text-white">{file.name}</p>
              <p className="text-white/40 text-sm">{(file.size / 1024 / 1024).toFixed(1)} МБ</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-5xl opacity-40">📂</div>
              <p className="font-bold text-white/70">Перетащи аудиофайл сюда</p>
              <p className="text-white/30 text-sm">MP3, WAV, FLAC, AAC, M4A — до ~10 минут</p>
            </div>
          )}
        </div>
      )}

      {/* Size error */}
      {sizeError && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-red-400 font-bold text-sm">Файл слишком большой</p>
            <p className="text-red-400/70 text-xs">Максимум {MAX_MB} МБ. Сожми трек или обрежь до нужного фрагмента.</p>
          </div>
        </div>
      )}

      {/* Start button */}
      {file && !job && (
        <button
          onClick={start}
          disabled={uploading}
          className="w-full py-4 rounded-xl font-black text-base tracking-wide bg-[var(--accent)] text-black
            hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? "Загружаем…" : "✂️ Разделить на стемы"}
        </button>
      )}

      {/* Progress */}
      {job && job.status !== "done" && (
        <div className="space-y-4">
          <div className="bg-white/5 rounded-2xl border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white/70">
                {job.status === "error" ? "⚠️ Ошибка" : "⏳ Обработка"}
              </span>
              <span className="text-sm text-white/40">{job.progress}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  job.status === "error" ? "bg-red-500" : "bg-[var(--accent)]"
                }`}
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <p className={`text-sm ${job.status === "error" ? "text-red-400" : "text-white/50"}`}>
              {job.message}
            </p>
            {job.status === "error" && (
              <button onClick={reset} className="text-sm text-white/50 hover:text-white underline">
                ← Загрузить другой файл
              </button>
            )}
          </div>
          {job.status !== "error" && (
            <p className="text-center text-white/30 text-xs">
              Demucs обрабатывает на CPU — займёт 1–5 минут в зависимости от длины трека
            </p>
          )}
        </div>
      )}

      {/* Results — stem cards */}
      {job?.status === "done" && jobId && (
        <div className="space-y-4">
          <p className="text-center text-green-400 font-bold text-sm">✅ Стемы готовы!</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {STEMS.map(s => (
              <div
                key={s.key}
                className={`bg-gradient-to-br ${s.grad} border ${s.border} rounded-2xl p-4 space-y-3`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{s.icon}</span>
                  <span className="font-black text-sm">{s.label}</span>
                </div>
                <audio
                  controls
                  src={stemUrl(s.key)}
                  className="w-full h-8"
                  style={{ filter: "invert(1) brightness(0.8)" }}
                />
                <a
                  href={stemUrl(s.key)}
                  download={`bugatti-${s.key}.wav`}
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-lg
                    bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all"
                >
                  ⬇ Скачать WAV
                </a>
              </div>
            ))}
          </div>
          <button
            onClick={reset}
            className="w-full py-3 rounded-xl border border-white/20 text-white/50 hover:text-white
              hover:border-white/40 text-sm font-bold transition-all"
          >
            ← Загрузить другой трек
          </button>
        </div>
      )}
    </div>
  );
}
