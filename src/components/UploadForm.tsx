"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Genre } from "@/types/db";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

interface Props {
  locale: Locale;
  dict: Dictionary;
  genres: Genre[];
  userId: string;
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function UploadForm({ locale, dict, genres, userId }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [genreId, setGenreId] = useState("");
  const [style, setStyle] = useState("");
  const [bpm, setBpm] = useState("");
  const [musicKey, setMusicKey] = useState("");
  const [description, setDescription] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [coverVideo, setCoverVideo] = useState<File | null>(null);
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError(dict.upload.errorTitle);
    if (!artist.trim()) return setError(dict.upload.errorArtist);
    if (!audioFile) return setError(dict.upload.errorAudio);

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const trackUuid =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      const folder = `${userId}/${trackUuid}`;

      setProgress("Uploading audio…");
      const audioPath = `${folder}/${safeFileName(audioFile.name)}`;
      {
        const { error } = await supabase.storage
          .from("audio-tracks")
          .upload(audioPath, audioFile, { upsert: true });
        if (error) throw error;
      }

      let previewPath: string | null = null;
      if (previewFile) {
        setProgress("Uploading preview…");
        previewPath = `${folder}/${safeFileName(previewFile.name)}`;
        const { error } = await supabase.storage
          .from("audio-previews")
          .upload(previewPath, previewFile, { upsert: true });
        if (error) throw error;
      }

      let coverImagePath: string | null = null;
      if (coverImage) {
        setProgress("Uploading cover image…");
        coverImagePath = `${folder}/${safeFileName(coverImage.name)}`;
        const { error } = await supabase.storage
          .from("covers")
          .upload(coverImagePath, coverImage, { upsert: true });
        if (error) throw error;
      }

      let coverVideoPath: string | null = null;
      if (coverVideo) {
        setProgress("Uploading cover video…");
        coverVideoPath = `${folder}/${safeFileName(coverVideo.name)}`;
        const { error } = await supabase.storage
          .from("covers")
          .upload(coverVideoPath, coverVideo, { upsert: true });
        if (error) throw error;
      }

      setProgress("Finalising…");
      const { error: insertErr } = await supabase.from("tracks").insert({
        id: trackUuid,
        uploader_id: userId,
        title: title.trim(),
        artist: artist.trim(),
        description: description.trim() || null,
        genre_id: genreId || null,
        style: style.trim() || null,
        bpm: bpm ? Number(bpm) : null,
        music_key: musicKey.trim() || null,
        audio_path: audioPath,
        preview_path: previewPath,
        cover_image_path: coverImagePath,
        cover_video_path: coverVideoPath,
        is_premium_only: premiumOnly,
        status: "pending",
        duration_seconds: null,
      });
      if (insertErr) throw insertErr;

      setDone(true);
      setProgress(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bs-card p-6">
        <h2 className="text-xl font-semibold">{dict.upload.successTitle}</h2>
        <p className="text-[var(--muted)] mt-2">{dict.upload.successBody}</p>
        <a href={`/${locale}/dashboard`} className="bs-button bs-button-primary mt-4 inline-flex">
          {dict.nav.dashboard}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bs-card p-6 space-y-3">
      {error && (
        <div className="text-sm text-red-300 border border-red-900/50 bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {progress && (
        <div className="text-sm text-emerald-200 border border-emerald-900/50 bg-emerald-900/20 rounded-lg px-3 py-2">
          {progress}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={dict.upload.trackTitle}>
          <input className="bs-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label={dict.upload.artist}>
          <input className="bs-input" value={artist} onChange={(e) => setArtist(e.target.value)} required />
        </Field>
        <Field label={dict.upload.genre}>
          <select className="bs-input" value={genreId} onChange={(e) => setGenreId(e.target.value)}>
            <option value="">—</option>
            {genres.map((g) => (
              <option key={g.id} value={g.id}>
                {locale === "ru" ? g.name_ru : g.name_en}
              </option>
            ))}
          </select>
        </Field>
        <Field label={dict.upload.style}>
          <input className="bs-input" value={style} onChange={(e) => setStyle(e.target.value)} />
        </Field>
        <Field label={dict.upload.bpm}>
          <input
            type="number"
            className="bs-input"
            value={bpm}
            onChange={(e) => setBpm(e.target.value)}
          />
        </Field>
        <Field label={dict.upload.key}>
          <input className="bs-input" value={musicKey} onChange={(e) => setMusicKey(e.target.value)} />
        </Field>
      </div>

      <Field label={dict.upload.description}>
        <textarea
          className="bs-input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <Field label={dict.upload.audioFile}>
        <input
          type="file"
          accept="audio/*"
          required
          onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
          className="bs-input file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-white/10"
        />
      </Field>
      <Field label={dict.upload.previewFile}>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setPreviewFile(e.target.files?.[0] ?? null)}
          className="bs-input file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-white/10"
        />
      </Field>
      <Field label={dict.upload.coverImage}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setCoverImage(e.target.files?.[0] ?? null)}
          className="bs-input file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-white/10"
        />
      </Field>
      <Field label={dict.upload.coverVideo}>
        <input
          type="file"
          accept="video/*,image/gif"
          onChange={(e) => setCoverVideo(e.target.files?.[0] ?? null)}
          className="bs-input file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-white/10"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={premiumOnly}
          onChange={(e) => setPremiumOnly(e.target.checked)}
        />
        {dict.upload.isPremiumOnly}
      </label>

      <button type="submit" disabled={submitting} className="bs-button bs-button-primary">
        {submitting ? dict.common.loading : dict.upload.submit}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
