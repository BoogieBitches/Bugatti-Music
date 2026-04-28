// Hand-written DB types matching supabase/migrations/*.sql
// Regenerate with `supabase gen types typescript` once a Supabase project is provisioned.

export type Locale = "en" | "ru";

export type UserRole = "user" | "admin";
export type TrackStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_premium: boolean;
  premium_until: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  preferred_locale: Locale;
  created_at: string;
  updated_at: string;
}

export interface Genre {
  id: string;
  slug: string;
  name_en: string;
  name_ru: string;
  position: number;
}

export interface Track {
  id: string;
  uploader_id: string;
  title: string;
  artist: string;
  description: string | null;
  genre_id: string | null;
  style: string | null;
  bpm: number | null;
  music_key: string | null;
  duration_seconds: number | null;
  audio_path: string;
  preview_path: string | null;
  cover_image_path: string | null;
  cover_video_path: string | null;
  status: TrackStatus;
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  plays_count: number;
  downloads_count: number;
  is_premium_only: boolean;
  created_at: string;
  updated_at: string;
}

export interface Favorite {
  user_id: string;
  track_id: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface TrackWithGenre extends Track {
  genre: Pick<Genre, "id" | "slug" | "name_en" | "name_ru"> | null;
  uploader: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, "id">;
        Update: Partial<Profile>;
      };
      tracks: {
        Row: Track;
        Insert: Omit<
          Track,
          | "id"
          | "created_at"
          | "updated_at"
          | "plays_count"
          | "downloads_count"
          | "approved_at"
          | "approved_by"
        > &
          Partial<Pick<Track, "id" | "approved_at" | "approved_by">>;
        Update: Partial<Track>;
      };
      genres: {
        Row: Genre;
        Insert: Omit<Genre, "id"> & Partial<Pick<Genre, "id">>;
        Update: Partial<Genre>;
      };
      favorites: {
        Row: Favorite;
        Insert: Omit<Favorite, "created_at"> & Partial<Pick<Favorite, "created_at">>;
        Update: Partial<Favorite>;
      };
      audit_log: {
        Row: AuditLogEntry;
        Insert: Omit<AuditLogEntry, "id" | "created_at"> &
          Partial<Pick<AuditLogEntry, "id" | "created_at">>;
        Update: Partial<AuditLogEntry>;
      };
    };
  };
};
