import { useCallback, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router';
import { PlayButton } from '../ui';
import type { EventRow } from './common';

/** One part of a recorded event, as the player plays it. */
export interface Part {
  recording: string;
  title: string;
  src: string;
  durationMs: number;
}

/** What is playing: an event's parts, which one, where in it, and the page it belongs to. */
export interface Playing {
  to: string;
  title: string;
  parts: Part[];
  index: number;
  /** Where in the part, in ms. */
  at: number;
  playing: boolean;
}

/*
 * The listening screens talk to the sound only through this file. Until the
 * site-wide player (the foundation's) is in, it keeps one <audio> of its own,
 * which lives as long as the page does, so it keeps playing from page to page.
 */
let state: Playing | null = null;
let audio: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();
const changed = (next: Playing | null) => {
  state = next;
  for (const listener of listeners) listener();
};

function sound(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.addEventListener('timeupdate', () => state && changed({ ...state, at: audio!.currentTime * 1000 }));
  audio.addEventListener('play', () => state && changed({ ...state, playing: true }));
  audio.addEventListener('pause', () => state && changed({ ...state, playing: false }));
  audio.addEventListener('ended', () => {
    if (state && state.index + 1 < state.parts.length) start({ ...state, index: state.index + 1, at: 0 });
  });
  return audio;
}

function start(next: Playing) {
  const player = sound();
  const part = next.parts[next.index];
  if (!part) return;
  changed({ ...next, playing: true });
  if (player.src !== part.src) player.src = part.src;
  const seek = () => {
    player.currentTime = next.at / 1000;
  };
  if (player.readyState >= 1) seek();
  else player.addEventListener('loadedmetadata', seek, { once: true });
  void player.play().catch(() => changed(state && { ...state, playing: false }));
}

export const player = {
  /** Play an event's parts from part `index`, at `at` ms into it. */
  play(event: Pick<Playing, 'to' | 'title' | 'parts'>, index = 0, at = 0) {
    start({ ...event, index, at, playing: true });
  },
  toggle() {
    if (!audio || !state) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** What is playing now (null before anything has), kept current as it plays. */
export function usePlaying(): Playing | null {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => null,
  );
}

/**
 * Play an event from a list: its page opens and starts it (the tap that
 * asked for it lets the sound start there).
 */
export function usePlayEvent() {
  const navigate = useNavigate();
  return useCallback((row: Pick<EventRow, 'to'>) => navigate(`${row.to}?play=1`), [navigate]);
}

/**
 * A recording in a list: the play button plays it where you are, the rest of
 * the line opens its page. Two targets side by side, never one inside the other.
 */
export function PlayRow({ row, end }: { row: EventRow; end?: string }) {
  const play = usePlayEvent();
  return (
    <div className="row">
      <PlayButton playing={false} size="small" aria-label={`לנגן: ${row.title}`} onClick={() => play(row)} />
      <Link to={row.to} className="t">
        <b>{row.title}</b>
        {row.sub && <span>{row.sub}</span>}
      </Link>
      {end && <span className="r">{end}</span>}
    </div>
  );
}
