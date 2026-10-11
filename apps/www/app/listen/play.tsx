import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { PlayButton } from '../ui';
import type { EventRow } from './common';

/**
 * Play an event from a list: its page opens and starts it in the site's
 * player (the tap that asked for it lets the sound start there).
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
