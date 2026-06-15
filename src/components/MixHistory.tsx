"use client";

import { useState, useEffect } from "react";

export interface MixRecord {
  id: string;
  jobId: string;
  style: string;
  styleLabel: string;
  trackCount: number;
  trackNames: string[];
  avgScore: number | null;
  durationMin: number | null;
  createdAt: string;
  apiBase: string;
}

const STORAGE_KEY = "bugatti-mix-history";
const MAX_RECORDS = 20;

// ── Storage helpers ────────────────────────────────────────────────────────────

export function saveToHistory(record: Omit<MixRecord, "id">) {
  try {
    const existing = loadHistory();
    const full: MixRecord = { ...record, id: crypto.randomUUID() };
    const updated = [full, ...existing].slice(0, MAX_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* localStorage unavailable */ }
}

export function loadHistory(): MixRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MixRecord[]) : [];
  } catch { return []; }
}

export function clearHistory() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function scoreColor(s: number) {
  return s >= 80 ? "#22c55e" : s >= 60 ? "#eab308" : "#ef4444";
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  onRestore?: (record: MixRecord) => void;
}

export function MixHistory({ onRestore }: Props) {
  const [records, setRecords] = useState<MixRecord[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<Record<string, "checking" | "available" | "expired">>({});

  useEffect(() => {
    setRecords(loadHistory());
  }, []);

  if (records.length === 0) return null;

  async function checkAvailability(record: MixRecord) {
    if (downloadStatus[record.id]) return;
    setDownloadStatus(s => ({ ...s, [record.id]: "checking" }));
    try {
      const res = await fetch(`${record.apiBase}/audio/jobs/${record.jobId}`, { method: "GET" });
      const data = res.ok ? await res.json() : null;
      setDownloadStatus(s => ({
        ...s,
        [record.id]: data?.status === "done" ? "available" : "expired",
      }));
    } catch {
      setDownloadStatus(s => ({ ...s, [record.id]: "expired" }));
    }
  }

  function handleExpand(id: string, record: MixRecord) {
    const next = expanded === id ? null : id;
    setExpanded(next);
    if (next) checkAvailability(record);
  }

  function handleClear() {
    clearHistory();
    setRecords([]);
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
          Mix History
          <span className="px-1.5 py-0.5 rounded-full bg-white/5 text-white/30 text-[10px] font-bold">{records.length}</span>
        </h2>
        <button onClick={handleClear}
          className="text-xs text-white/20 hover:text-red-400 transition-colors">
          Clear all
        </button>
      </div>

      <div className="space-y-2">
        {records.map(r => {
          const isOpen = expanded === r.id;
          const dlStatus = downloadStatus[r.id];
          const downloadUrl = `${r.apiBase}/audio/jobs/${r.jobId}/download`;

          return (
            <div key={r.id} className="bs-card overflow-hidden">
              <button
                onClick={() => handleExpand(r.id, r)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                {/* Score ring mini */}
                {r.avgScore != null ? (
                  <span className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center border-2 text-xs font-black"
                    style={{ borderColor: scoreColor(r.avgScore), color: scoreColor(r.avgScore) }}>
                    {r.avgScore}
                  </span>
                ) : (
                  <span className="shrink-0 w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white/20 text-xs">?</span>
                )}

                {/* Meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm font-bold text-white">{r.styleLabel}</span>
                    <span className="text-xs text-white/30">{r.trackCount} tracks</span>
                    {r.durationMin && <span className="text-xs text-white/30">~{r.durationMin}min</span>}
                  </div>
                  <div className="text-xs text-white/30 truncate">
                    {r.trackNames.slice(0, 3).join(" · ")}{r.trackNames.length > 3 ? ` +${r.trackNames.length - 3}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-white/25">{relativeTime(r.createdAt)}</span>
                  <span className={`text-white/25 text-xs transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-white/5 flex flex-wrap items-center gap-3">
                  {dlStatus === "checking" && (
                    <span className="flex items-center gap-2 text-xs text-white/30">
                      <span className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                      Checking server…
                    </span>
                  )}
                  {dlStatus === "available" && (
                    <>
                      <a href={downloadUrl} download={`bugatti-mix-${r.id.slice(0,6)}.mp3`}
                        className="bs-button bs-button-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5">
                        ⬇ Download MP3
                      </a>
                      {onRestore && (
                        <button onClick={() => onRestore(r)}
                          className="bs-button px-4 py-2 text-xs font-semibold text-white/60 hover:text-white">
                          Open in Player
                        </button>
                      )}
                    </>
                  )}
                  {dlStatus === "expired" && (
                    <div className="flex items-center gap-2 text-xs text-white/30">
                      <span className="px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-red-400">Expired</span>
                      <span>Server clears files after restart. Re-generate to download again.</span>
                    </div>
                  )}
                  <div className="ml-auto text-xs text-white/20 font-mono">{r.jobId.slice(0, 8)}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
