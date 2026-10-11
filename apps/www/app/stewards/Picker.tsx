import { useEffect, useId, useState } from 'react';
import type { Found } from '../routes/find';
import { Icon, Row, Rows } from '../ui';

/** Items found by name as one types (GET /_/find), a moment after the typing stops; `null` until two letters are typed. */
export function useFind(q: string, type?: string): Found[] | null {
  const [found, setFound] = useState<Found[] | null>(null);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return setFound(null);
    let live = true;
    const timer = setTimeout(() => {
      fetch(`/_/find?${new URLSearchParams({ q: text, ...(type ? { type } : {}) })}`, { headers: { accept: 'application/json' } })
        .then((r) => (r.ok ? (r.json() as Promise<{ items: Found[] }>) : { items: [] }))
        .then((answer) => live && setFound(answer.items))
        .catch(() => live && setFound([]));
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, type]);
  return found;
}

/**
 * Where to move picked rows, or which item a duplicate merges into: the near
 * choices as rows to press, and a search by name for any other; never a
 * drop-down. `top` offers the top of the library; `keep`, keeping a sefer in
 * this set as well.
 */
export function Picker({
  label,
  type,
  quick,
  exclude,
  top,
  keep,
  onPick,
}: {
  label: string;
  type: string;
  quick: Found[];
  exclude: string[];
  top?: string;
  keep?: string;
  onPick: (id: string | null, label: string, keep: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const [keeping, setKeeping] = useState(false);
  const found = useFind(q, type);
  const id = useId();
  const rows = (found ?? quick).filter((row) => !exclude.includes(row.id));
  return (
    <div className="picker">
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} dir="auto" autoComplete="off" />
      </div>
      {keep && (
        <label className="check">
          <input type="checkbox" checked={keeping} onChange={(e) => setKeeping(e.target.checked)} />
          {keep}
        </label>
      )}
      <Rows>
        {top && <Row start={<Icon name="library" />} title={top} onClick={() => onPick(null, top, keeping)} />}
        {rows.map((row) => (
          <Row key={row.id} title={row.label} sub={row.sub || (row.path ? <bdi dir="ltr">{row.path}</bdi> : undefined)} onClick={() => onPick(row.id, row.label, keeping)} />
        ))}
      </Rows>
      {found && found.length === 0 && <p className="faint sm">לא נמצא דבר.</p>}
    </div>
  );
}
