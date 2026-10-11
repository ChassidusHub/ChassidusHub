import { useSyncExternalStore } from 'react';

/** A part of a recording: a sicha, a niggun, a maamar. Times are in milliseconds from the recording's start. */
export interface Chapter {
  title: string;
  start: number;
  duration: number;
  /** When each part is a file of its own; else the recording's `src` plays them all. */
  src?: string;
}

/** A phrase of the words, with when it is heard, in milliseconds from its chapter's start. */
export interface Phrase {
  text: string;
  start: number;
}

/** What the player plays: a recording, its parts, and how to fetch each part's words. */
export interface Track {
  id: string;
  /** "י״ט כסלו תשמ״ז" */
  title: string;
  /** The recording's page, to go back to it from the player. */
  to?: string;
  src?: string;
  chapters: Chapter[];
  /** A part's words, when it has any; heard by a machine unless `checked`. */
  words?: (chapter: number) => Promise<{ phrases: Phrase[]; checked: boolean } | null>;
}

export const SPEEDS = [1, 1.25, 1.5] as const;
export type Speed = (typeof SPEEDS)[number];

export interface PlayerState {
  track: Track | null;
  playing: boolean;
  /** Where in the whole recording, in milliseconds. */
  position: number;
  speed: Speed;
}

const idle: PlayerState = { track: null, playing: false, position: 0, speed: 1 };
let state: PlayerState = idle;
const listeners = new Set<() => void>();
let audio: HTMLAudioElement | null = null;
/** The file loaded now and the recording time its 0 stands for (a part's start, when parts are files of their own). */
let loaded: { src: string; offset: number } | null = null;

function set(next: Partial<PlayerState>) {
  state = { ...state, ...next };
  for (const changed of listeners) changed();
}

export const total = (track: Track) => track.chapters.reduce((end, c) => Math.max(end, c.start + c.duration), 0);

/** The part being heard at a time. */
export function chapterAt(track: Track, position: number): number {
  let at = 0;
  track.chapters.forEach((chapter, index) => {
    if (position >= chapter.start) at = index;
  });
  return at;
}

/** Where we last were, kept in this browser so "continue listening" can offer it. */
const SAVED = 'player';
function save() {
  if (!state.track) return;
  try {
    localStorage.setItem(SAVED, JSON.stringify({ id: state.track.id, title: state.track.title, to: state.track.to, position: Math.round(state.position) }));
  } catch {
    // Not kept (a private window): nothing else depends on it.
  }
}
export function lastPlayed(): { id: string; title: string; to?: string; position: number } | null {
  try {
    return JSON.parse(localStorage.getItem(SAVED) ?? 'null');
  } catch {
    return null;
  }
}

function element(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  let lastSave = 0;
  audio.addEventListener('timeupdate', () => {
    if (!loaded || !audio) return;
    set({ position: loaded.offset + audio.currentTime * 1000 });
    if (Date.now() - lastSave > 5000) {
      lastSave = Date.now();
      save();
    }
  });
  audio.addEventListener('play', () => set({ playing: true }));
  audio.addEventListener('pause', () => {
    set({ playing: false });
    save();
  });
  audio.addEventListener('ended', () => {
    // A part that is a file of its own goes on to the next part.
    const track = state.track;
    if (!track) return;
    const next = chapterAt(track, state.position) + 1;
    if (track.chapters[next]?.src) void seek(track.chapters[next]!.start, true);
    else set({ playing: false });
  });
  return audio;
}

/** Loads the file that holds `position` and moves there; plays if asked. */
async function seek(position: number, play = state.playing) {
  const track = state.track;
  if (!track) return;
  const length = total(track);
  position = Math.max(0, length ? Math.min(position, length - 250) : position);
  const chapter = track.chapters[chapterAt(track, position)];
  const file = chapter?.src ? { src: chapter.src, offset: chapter.start } : { src: track.src ?? '', offset: 0 };
  const media = element();
  if (loaded?.src !== file.src) {
    loaded = file;
    media.src = file.src;
  }
  media.currentTime = (position - file.offset) / 1000;
  media.playbackRate = state.speed;
  set({ position });
  if (play) await media.play().catch(() => set({ playing: false }));
  showOnLockScreen();
}

/** The phone's lock screen and headphones: title, play and pause, back 15 and forward 30. */
function showOnLockScreen() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !state.track) return;
  const track = state.track;
  navigator.mediaSession.metadata = new MediaMetadata({ title: track.chapters[chapterAt(track, state.position)]?.title ?? track.title, artist: track.title, album: 'ChassidusHub' });
  navigator.mediaSession.setActionHandler('play', () => player.toggle());
  navigator.mediaSession.setActionHandler('pause', () => player.toggle());
  navigator.mediaSession.setActionHandler('seekbackward', () => player.skip(-15_000));
  navigator.mediaSession.setActionHandler('seekforward', () => player.skip(30_000));
  navigator.mediaSession.setActionHandler('previoustrack', () => player.previous());
  navigator.mediaSession.setActionHandler('nexttrack', () => player.next());
}

/**
 * The one player of the whole site. It lives outside every page, so what plays
 * keeps playing while the reader moves around the site; pages only call it.
 */
export const player = {
  /** Plays a recording from `at` (milliseconds), or from where it was if it is the one loaded. */
  play(track: Track, at?: number) {
    if (state.track?.id !== track.id) {
      loaded = null;
      set({ track, position: at ?? 0 });
    }
    void seek(at ?? state.position, true);
  },
  toggle() {
    if (!state.track) return;
    const media = element();
    if (media.paused) void seek(state.position, true);
    else media.pause();
  },
  seek(position: number) {
    void seek(position);
  },
  skip(by: number) {
    void seek(state.position + by);
  },
  /** To a part's start. */
  chapter(index: number) {
    const chapter = state.track?.chapters[index];
    if (chapter) void seek(chapter.start, true);
  },
  /** Back to this part's start, or to the part before when already at the start (the first 3 seconds). */
  previous() {
    const track = state.track;
    if (!track) return;
    const at = chapterAt(track, state.position);
    const chapter = track.chapters[at]!;
    void seek(state.position - chapter.start > 3000 || at === 0 ? chapter.start : track.chapters[at - 1]!.start);
  },
  next() {
    const track = state.track;
    if (!track) return;
    const next = track.chapters[chapterAt(track, state.position) + 1];
    if (next) void seek(next.start);
  },
  /** 1×, 1.25×, 1.5× and round again. */
  nextSpeed() {
    const speed = SPEEDS[(SPEEDS.indexOf(state.speed) + 1) % SPEEDS.length]!;
    if (audio) audio.playbackRate = speed;
    set({ speed });
  },
  close() {
    save();
    audio?.pause();
    if (audio) audio.removeAttribute('src');
    loaded = null;
    set({ track: null, playing: false, position: 0 });
  },
};

function subscribe(changed: () => void) {
  listeners.add(changed);
  return () => listeners.delete(changed);
}

/**
 * The player's state, or one part of it: `usePlayer((s) => s.playing)` re-renders
 * only when that part changes, so a page that only needs the track is not
 * redrawn four times a second while it plays.
 */
export function usePlayer(): PlayerState;
export function usePlayer<T>(pick: (s: PlayerState) => T): T;
export function usePlayer<T>(pick?: (s: PlayerState) => T) {
  const get = () => (pick ? pick(state) : state);
  const server = () => (pick ? pick(idle) : idle);
  return useSyncExternalStore(subscribe, get, server);
}

/**
 * Follow-along: which of a part's phrases is being heard now, or -1. For a
 * recording's page and the player's words: light that phrase, keep it in view.
 */
export function useHeard(trackId: string | undefined, chapter: number, phrases: Phrase[] | null | undefined): number {
  return usePlayer((s) => {
    if (!phrases || !s.track || s.track.id !== trackId) return -1;
    const part = s.track.chapters[chapter];
    if (!part || chapterAt(s.track, s.position) !== chapter) return -1;
    const at = s.position - part.start;
    let heard = -1;
    for (let index = 0; index < phrases.length && phrases[index]!.start <= at; index++) heard = index;
    return heard;
  });
}

/** 1:05:09 or 5:09. */
export function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
