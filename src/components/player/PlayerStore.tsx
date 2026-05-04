"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface PlayerTrack {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  videoUrl?: string | null;
  src: string;
  href: string;
  isPreview?: boolean;
  genre?: string | null;
}

interface PlayerState {
  current: PlayerTrack | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
}

interface PlayerActions {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  play: (track: PlayerTrack) => void;
  toggle: () => void;
  pause: () => void;
  resume: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  close: () => void;
  registerFirstPlayCallback: (cb: (id: string) => void) => () => void;
}

const Ctx = createContext<(PlayerState & PlayerActions) | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const firedOnceRef = useRef<Set<string>>(new Set());
  const cbsRef = useRef<Set<(id: string) => void>>(new Set());

  const [current, setCurrent] = useState<PlayerTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);

  // sync <audio> element events
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentTime(a.currentTime);
    const onMeta = () => setDuration(a.duration || 0);
    const onEnd = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [current?.id]);

  const play = useCallback((track: PlayerTrack) => {
    const a = audioRef.current;
    setCurrent((prev) => {
      if (prev?.id === track.id && a) {
        // just resume
        a.play().catch(() => {});
        return prev;
      }
      return track;
    });
    // if same track: effect below handles nothing; if new: play after src change
    queueMicrotask(() => {
      const a2 = audioRef.current;
      if (!a2) return;
      if (a2.paused) a2.play().catch(() => {});
    });
    if (!firedOnceRef.current.has(track.id)) {
      firedOnceRef.current.add(track.id);
      cbsRef.current.forEach((cb) => {
        try {
          cb(track.id);
        } catch {
          // ignore
        }
      });
    }
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, [current]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {});
  }, []);

  const seek = useCallback((seconds: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(seconds, a.duration || 0));
    setCurrentTime(a.currentTime);
  }, []);

  const setVolume = useCallback((v: number) => {
    const a = audioRef.current;
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    if (a) a.volume = clamped;
    if (clamped > 0 && muted) {
      setMutedState(false);
      if (a) a.muted = false;
    }
  }, [muted]);

  const setMuted = useCallback((m: boolean) => {
    const a = audioRef.current;
    setMutedState(m);
    if (a) a.muted = m;
  }, []);

  const close = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setCurrent(null);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const registerFirstPlayCallback = useCallback(
    (cb: (id: string) => void) => {
      cbsRef.current.add(cb);
      return () => {
        cbsRef.current.delete(cb);
      };
    },
    [],
  );

  const value = useMemo<PlayerState & PlayerActions>(
    () => ({
      current,
      playing,
      currentTime,
      duration,
      volume,
      muted,
      audioRef,
      play,
      toggle,
      pause,
      resume,
      seek,
      setVolume,
      setMuted,
      close,
      registerFirstPlayCallback,
    }),
    [
      current,
      playing,
      currentTime,
      duration,
      volume,
      muted,
      play,
      toggle,
      pause,
      resume,
      seek,
      setVolume,
      setMuted,
      close,
      registerFirstPlayCallback,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Single <audio> element drives the whole app */}
      <audio
        ref={audioRef}
        src={current?.src}
        preload="metadata"
        onError={() => setPlaying(false)}
      />
    </Ctx.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}
