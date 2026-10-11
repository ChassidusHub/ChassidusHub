import { useMemo } from 'react';
import { data } from 'react-router';
import { recordedEvent } from '../listen/recording.server';
import { KINDS } from '../tools/common';
import { itemName, orNothing } from '../tools/item.server';
import { clock, Logo, PlayButton, player, Row, Rows, usePlayer, type Track } from '../ui';
import { chapterAt } from '../ui/player/engine';
import { PlayerDock } from '../ui/player/PlayerDock';
import type { Route } from './+types/embed';

/**
 * An item as other sites embed it, and the one page they may frame: its
 * name, what it is, a farbrengen's recordings to play in place (the site's
 * own player), and a link to it on ChassidusHub. No shell, no menus, no
 * sign-in. A recording opens at its own part.
 *
 *   <iframe src="https://chassidushub.org/embed/rh-…" width="100%" height="320"></iframe>
 */
export async function loader({ request, params, context: { api } }: Route.LoaderArgs) {
  if (!/^rh-[\w-]+$/i.test(params.id)) throw data('not found', { status: 404 });
  const item = await orNothing(api.getItem({ id: params.id }));
  if (!item) throw data('not found', { status: 404 });
  const origin = new URL(request.url).origin;
  const fields = item.data as { event?: string };
  const eventId = item.type === 'event' ? item.id : item.type === 'recording' ? fields.event : undefined;
  const event = eventId ? await recordedEvent(api, eventId).catch(() => null) : null;
  if (event) {
    const to = `/listen/${event.year}/${event.id}${item.type === 'recording' ? `?r=${item.id}` : ''}`;
    return {
      kind: item.type === 'recording' ? 'הקלטה' : 'התוועדות',
      title: event.title || event.date,
      date: event.title ? event.date : '',
      link: `${origin}${to}`,
      track: { id: event.id, title: event.date, chapters: event.chapters.map((c) => ({ title: c.title, start: c.offset, duration: c.durationMs, src: c.src })) },
      start: item.type === 'recording' ? (event.chapters.find((c) => c.recording === item.id)?.offset ?? 0) : 0,
    };
  }
  return { kind: KINDS[item.type] ?? '', title: itemName(item), date: '', link: `${origin}${item.path ?? `/${item.id}`}`, track: null, start: 0 };
}

// Framed by any site (lib/safety.ts keeps every other page from being framed), and kept like any page.
export const headers = () => ({ 'Cache-Control': 'public, max-age=300, s-maxage=3600', 'Content-Security-Policy': 'frame-ancestors *' });

export function meta({ data: embed }: Route.MetaArgs) {
  return [{ title: embed ? `${embed.title} · ChassidusHub` : 'ChassidusHub' }];
}

export default function Embed({ loaderData: embed }: Route.ComponentProps) {
  const track = useMemo<Track | null>(() => embed.track, [embed.track]);
  const mine = usePlayer((s) => !!track && s.track?.id === track.id);
  const playing = usePlayer((s) => mine && s.playing);
  const at = usePlayer((s) => (mine && track ? chapterAt(track, s.position) : -1));
  return (
    <main id="content" className="it-embed">
      {embed.kind && <p className="faint sm">{embed.kind}</p>}
      <h1>{embed.title}</h1>
      {embed.date && <p className="faint sm">{embed.date}</p>}
      {track && track.chapters.length > 0 && (
        <>
          <div className="rec-acts">
            <PlayButton playing={playing} onClick={() => (mine ? player.toggle() : player.play(track, embed.start))} aria-label={playing ? 'עצירה' : 'ניגון'} />
            <span className="faint sm">{track.chapters.length > 1 ? `${track.chapters.length} חלקים` : clock(track.chapters[0]!.duration)}</span>
          </div>
          <Rows quiet>
            {track.chapters.map((chapter, index) => (
              <Row key={index} title={chapter.title} end={chapter.duration ? clock(chapter.duration) : undefined} current={index === at} onClick={() => player.play(track, chapter.start)} />
            ))}
          </Rows>
        </>
      )}
      <p className="it-embed-foot">
        <a href={embed.link} target="_blank" rel="noopener">
          <Logo name={false} />
          <span>לפתוח ב־ChassidusHub</span>
        </a>
      </p>
      {track && (
        <div className="dock">
          <PlayerDock />
        </div>
      )}
    </main>
  );
}
