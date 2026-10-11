import { Fragment, useEffect, useMemo, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { data, Link, useRevalidator } from 'react-router';
import { useAccount } from '../lib/account';
import { call, nameOf } from '../stewards/call';
import { dropAt, groupsOf, holds, KINDS, pick, planOf, said, slugOf, step, type Group, type Operation, type Preview, type Sent, type TreeNode } from '../stewards/organize';
import { Picker } from '../stewards/Picker';
import { Button, Field, Icon, IconButton, Panel, Say, SectionHead, Sheet, TopBar, type MenuItem, type PathLevel } from '../ui';
import type { Route } from './+types/organize';

export const handle = { section: 'library' };

/** A row's name as the site shows it, or its id. */
const nodeName = (node: Pick<TreeNode, 'name' | 'id'>) => nameOf(node.name, node.id);

interface Crumb {
  id: string;
  name: string;
}

const ID = /^rh-[0-9a-z]+$/;

/**
 * One level of the tree, the same for everyone: the library's top sets, or a
 * set's sets and sefarim, or a sefer's sichos; and the sets above it, for the
 * path bar (a set's parent, a sefer's first set).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const asked = new URL(request.url).searchParams.get('root')?.toLowerCase() ?? '';
  if (asked && !ID.test(asked)) throw data(null, { status: 404 });
  const tree = await context.api.catalogTree({ ...(asked ? { root: asked } : {}), depth: 1, limit: 500 }).catch((error: { status?: number }) => {
    if (error.status === 400 || error.status === 404) throw data(null, { status: 404 });
    throw error;
  });
  const crumbs: Crumb[] = [];
  if (tree.root) {
    const itemData = async (id: string) => ((await context.api.getItem({ id }).catch(() => null))?.data ?? null) as { name?: unknown; parent?: string; sets?: string[] } | null;
    const own = await itemData(tree.root.id);
    let up = tree.root.type === 'set' ? own?.parent : own?.sets?.[0];
    for (let hop = 0; up && hop < 8; hop++) {
      const above = await itemData(up);
      if (!above) break;
      crumbs.unshift({ id: up, name: nameOf(above.name, up) });
      up = above.parent;
    }
  }
  return { root: tree.root, children: tree.children, more: tree.more, crumbs };
}

/** The tree changes only when the catalog does. */
export function headers() {
  return { 'Cache-Control': 'public, max-age=60, s-maxage=120' };
}

export function meta({ data: page }: Route.MetaArgs) {
  return [{ title: `${page?.root ? `סידור: ${nodeName(page.root)}` : 'סידור הקטלוג'} · ChassidusHub` }, { name: 'robots', content: 'noindex' }];
}

/** The sets (or sefarim) at a level of the tree, as a path bar menu; the one the page is on marked. */
function levelOf(key: string, label: string, title: string, parent: string | null, current: string | null): PathLevel {
  return {
    key,
    label,
    title,
    ...(parent === null && key === 'top' ? { icon: 'library' as const } : {}),
    items: async (): Promise<MenuItem[]> => {
      const tree = await call<{ children: TreeNode[] }>(`/_/organize/tree?limit=500${parent ? `&root=${parent}` : ''}`);
      return tree.children
        .filter((c) => c.type === 'set' || c.type === 'work')
        .map((c) => ({ key: c.id, label: nodeName(c), to: `/organize?root=${c.id}`, current: c.id === current }));
    },
  };
}

type Dialog = { kind: 'move' | 'merge' } | { kind: 'rename'; id: string } | { kind: 'new-set' } | null;

/**
 * Organizing the catalog by hand (thread 6, rebuilt from the old /organize):
 * pick rows, then move them to another set, up a level or out of this set,
 * rename one, merge it into its duplicate, make a new set of them, remove an
 * empty set, or put a list in a new order (drag, or the arrows). Every change
 * waits in one list; the preview shows each item before and after; sending
 * makes ONE Suggestion of it all, reviewed like anyone's. A steward who may
 * approve their own may put it in the catalog at once.
 */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const { crumbs, more } = loaderData;
  const root = loaderData.root as TreeNode | null;
  const children = loaderData.children as TreeNode[];
  const account = useAccount();
  const revalidator = useRevalidator();
  const groups = useMemo(() => groupsOf(root, children), [root, children]);
  const byId = useMemo(() => new Map(children.map((c) => [c.id, c])), [children]);
  const [names, setNames] = useState<Record<string, string>>({});
  const nameFor = (id: string) => names[id] ?? (byId.get(id) ? nodeName(byId.get(id)!) : root?.id === id ? nodeName(root) : (crumbs.find((c) => c.id === id)?.name ?? id));

  const firstOrders = () => Object.fromEntries(groups.map((g) => [g.key, g.nodes.map((n) => n.id)]));
  const [orders, setOrders] = useState<Record<string, string[]>>(firstOrders);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [last, setLast] = useState<string | null>(null);
  const [steps, setSteps] = useState<Operation[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dragging, setDragging] = useState<string[] | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  // Another level of the tree, or the same one after the change went in: start again from it.
  useEffect(() => {
    setOrders(firstOrders());
    setPicked(new Set());
    setSteps([]);
    setPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  const plan = planOf(steps, groups, orders);
  const all = groups.flatMap((g) => orders[g.key] ?? []);
  const chosen = all.filter((id) => picked.has(id));
  const chosenNodes = chosen.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
  const onlySets = chosenNodes.length > 0 && chosenNodes.every((n) => n.type === 'set');
  const inSet = root?.type === 'set';
  const none = !ready || chosen.length === 0;

  const add = (...ops: Operation[]) => {
    setSteps((list) => [...list, ...ops]);
    setPreview(null);
    setSent(null);
    setPicked(new Set());
  };

  const move = (group: Group, id: string, by: -1 | 1) => {
    const list = orders[group.key] ?? [];
    setOrders({ ...orders, [group.key]: step(list, picked.has(id) ? list.filter((x) => picked.has(x)) : [id], by) });
    setPreview(null);
  };

  const onKey = (group: Group, id: string, event: KeyboardEvent) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    move(group, id, event.key === 'ArrowUp' ? -1 : 1);
  };

  const onDrop = (group: Group, before: string | null, event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragging) setOrders({ ...orders, [group.key]: dropAt(orders[group.key] ?? [], dragging, before) });
    setDragging(null);
    setOver(null);
    setPreview(null);
  };

  async function run(what: 'preview' | 'send') {
    setBusy(true);
    setError(null);
    try {
      if (what === 'preview') setPreview(await call<Preview>('/_/organize/preview', 'POST', { operations: plan }));
      else {
        const made = await call<Sent>('/_/organize', 'POST', { operations: plan, title: title.trim() || undefined, description: why.trim() || undefined });
        setSent(made);
        setSteps([]);
        setPreview(null);
        if (made.merged) void revalidator.revalidate();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function applyNow() {
    if (!sent) return;
    setBusy(true);
    setError(null);
    try {
      await call(`/_/organize/approve/${sent.suggestion.id}`, 'POST', {});
      setSent({ ...sent, merged: true, mayApprove: false });
      void revalidator.revalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // The path bar: the top of the library, the sets above, and this one, each a menu of the others at its level.
  const path: PathLevel[] = [levelOf('top', 'סידור', 'סטים בראש הספרייה', null, crumbs[0]?.id ?? root?.id ?? null)];
  const trail = [...crumbs, ...(root ? [{ id: root.id, name: nodeName(root) }] : [])];
  trail.forEach((crumb, at) => {
    const parent = trail[at - 1];
    path.push(levelOf(crumb.id, crumb.name, parent ? `בתוך ${parent.name}` : 'סטים בראש הספרייה', parent?.id ?? null, crumb.id));
  });

  const rename = dialog?.kind === 'rename' ? byId.get(dialog.id) : undefined;
  const pickType = dialog?.kind === 'merge' ? (chosenNodes[0]?.type ?? 'set') : chosenNodes.some((n) => n.type === 'unit') ? 'work' : 'set';
  const quick = dialog?.kind === 'move' || dialog?.kind === 'merge'
    ? [
        ...(dialog.kind === 'move' && crumbs.length ? [{ id: crumbs[crumbs.length - 1]!.id, type: 'set', path: null, label: crumbs[crumbs.length - 1]!.name, sub: 'הסט שמעל' }] : []),
        ...children.filter((c) => !picked.has(c.id) && c.type === pickType).map((c) => ({ id: c.id, type: c.type, path: c.path, label: nodeName(c), sub: c.path ?? '' })),
      ]
    : [];

  return (
    <>
      <TopBar path={path} />
      <main id="content" className="view wide">
        <h1>{root ? `סידור: ${nodeName(root)}` : 'סידור הקטלוג'}</h1>
        <p className="lede">בוחרים שורות, ומעבירים, משנים שם, מסדרים מחדש, יוצרים סט או ממזגים כפולים. כל השינויים יחד נשלחים כהצעה אחת, ונבדקים לפני שהם נכנסים. כתובות ישנות ממשיכות להוביל למקום החדש.</p>
        <noscript>
          <Say>הסידור פועל עם JavaScript.</Say>
        </noscript>

        <div className="orgbar" role="toolbar" aria-label="פעולות על השורות שנבחרו">
          <span className="count">
            נבחרו <b>{chosen.length}</b>
          </span>
          <Button small look="outline" disabled={none} onClick={() => setDialog({ kind: 'move' })}>
            העברה אל…
          </Button>
          <Button small look="outline" disabled={none || (root === null && !onlySets)} onClick={() => add({ op: 'move-up', items: chosen, ...(inSet && !onlySets ? { from: root!.id } : {}) })}>
            העלאה רמה
          </Button>
          {inSet && chosenNodes.some((n) => n.type !== 'set') && (
            <Button small look="outline" onClick={() => add({ op: 'move', items: chosen.filter((id) => byId.get(id)?.type !== 'set'), to: null, from: root!.id })}>
              הוצאה מהסט
            </Button>
          )}
          <Button small look="outline" icon="pen" disabled={!ready || chosen.length !== 1} onClick={() => setDialog({ kind: 'rename', id: chosen[0]! })}>
            שינוי שם
          </Button>
          <Button small look="outline" disabled={!ready || chosen.length !== 1} onClick={() => setDialog({ kind: 'merge' })}>
            מיזוג אל…
          </Button>
          {root?.type !== 'work' && (
            <Button small look="outline" icon="plus" disabled={!ready} onClick={() => setDialog({ kind: 'new-set' })}>
              סט חדש
            </Button>
          )}
          {chosenNodes.length > 0 && chosenNodes.every((n) => n.type === 'set' && !n.counts.sets && !n.counts.items) && (
            <Button small look="outline" onClick={() => add(...chosen.map((id): Operation => ({ op: 'delete-set', item: id })))}>
              מחיקת הסט הריק
            </Button>
          )}
          <Button small look="ghost" disabled={!ready || all.length === 0} onClick={() => setPicked(picked.size === all.length ? new Set() : new Set(all))}>
            {picked.size === all.length && all.length > 0 ? 'ניקוי הבחירה' : 'בחירת הכל'}
          </Button>
        </div>

        {groups.length === 0 && <Say>אין כאן עדיין דבר לסדר.</Say>}
        {groups.map((group) => (
          <section key={group.key} aria-label={group.title}>
            <SectionHead title={`${group.title} (${group.nodes.length})`} />
            <div className="rows org" onDragOver={(e) => dragging && e.preventDefault()} onDrop={(e) => group.orderable && onDrop(group, null, e)}>
              {(orders[group.key] ?? []).map((id) => {
                const node = byId.get(id);
                if (!node) return null;
                const renamed = steps.find((o): o is Extract<Operation, { op: 'rename' }> => o.op === 'rename' && o.item === id);
                const sub = [KINDS[node.type] ?? node.type, node.path, holds(node)].filter(Boolean);
                return (
                  <div
                    key={id}
                    className={['row', picked.has(id) && 'on', over === id && 'over', dragging?.includes(id) && 'dragged'].filter(Boolean).join(' ')}
                    draggable={ready && group.orderable}
                    onDragStart={(e) => {
                      const list = orders[group.key] ?? [];
                      setDragging(picked.has(id) ? list.filter((x) => picked.has(x)) : [id]);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', id);
                    }}
                    onDragOver={(e) => {
                      if (!dragging) return;
                      e.preventDefault();
                      setOver(id);
                    }}
                    onDragEnd={() => (setDragging(null), setOver(null))}
                    onDrop={(e) => group.orderable && onDrop(group, id, e)}
                  >
                    <input
                      type="checkbox"
                      id={`pick-${id}`}
                      checked={picked.has(id)}
                      disabled={!ready}
                      onClick={(e: MouseEvent<HTMLInputElement>) => {
                        setPicked(pick(all, picked, id, e.shiftKey, last));
                        setLast(id);
                      }}
                      onChange={() => undefined}
                    />
                    <label className="t" htmlFor={`pick-${id}`}>
                      <b>
                        {nameFor(id)}
                        {renamed && <span className="renamed"> · שם חדש: {[renamed.name?.he, renamed.name?.en].filter(Boolean).join(' / ') || renamed.slug}</span>}
                      </b>
                      <span>
                        {sub.map((part, at) => (
                          <Fragment key={at}>
                            {at > 0 ? ' · ' : ''}
                            {part === node.path ? <bdi dir="ltr">{part}</bdi> : part}
                          </Fragment>
                        ))}
                      </span>
                    </label>
                    {group.orderable && (
                      <>
                        <IconButton small icon="chevron-up" label={`למעלה ברשימה: ${nameFor(id)}`} disabled={!ready} onClick={() => move(group, id, -1)} onKeyDown={(e) => onKey(group, id, e)} />
                        <IconButton small icon="chevron-down" label={`למטה ברשימה: ${nameFor(id)}`} disabled={!ready} onClick={() => move(group, id, 1)} onKeyDown={(e) => onKey(group, id, e)} />
                      </>
                    )}
                    {(node.type === 'set' || node.type === 'work') && (
                      <Link className="ib small" to={`/organize?root=${node.id}`} aria-label={`סידור בתוכו: ${nameFor(id)}`} title="סידור בתוכו">
                        <Icon name="chevron-left" />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {more > 0 && <p className="faint sm">ועוד {more} שלא מוצגים כאן.</p>}
        <p className="faint sm">לשינוי הסדר: גוררים שורה, או לוחצים על החיצים (גם Alt עם החיצים במקלדת).</p>

        <Panel title={`השינויים (${plan.length})`}>
          {plan.length === 0 ? (
            <p>עוד לא נבחר שינוי. בוחרים שורות ופעולה, או משנים את הסדר.</p>
          ) : (
            <ol className="orgplan">
              {plan.map((op, at) => (
                <li key={at}>
                  <span>{said(op, nameFor)}</span>
                  <IconButton
                    small
                    icon="close"
                    label={`הסרה: ${said(op, nameFor)}`}
                    onClick={() => {
                      if (at < steps.length) setSteps(steps.filter((_, i) => i !== at));
                      else setOrders(firstOrders());
                      setPreview(null);
                    }}
                  />
                </li>
              ))}
            </ol>
          )}

          {preview && <PreviewList preview={preview} />}
          {error && <Say tone="bad">{error}</Say>}
          {sent && (
            <Say tone="good">
              {sent.merged ? 'השינויים נכנסו לקטלוג.' : 'ההצעה נשלחה לבדיקה.'}{' '}
              {sent.suggestion.number != null && <Link to={`/suggestions/${sent.suggestion.number}`}>להצעה #{sent.suggestion.number}</Link>}
              {sent.mayApprove && !sent.merged && (
                <span className="btns">
                  <Button small icon="check" onClick={applyNow} disabled={busy}>
                    לאשר ולהכניס עכשיו
                  </Button>
                </span>
              )}
            </Say>
          )}

          {account === null ? (
            <Say>
              כדי לסדר את הקטלוג צריך להיכנס. <Link to={`/signin?return=${encodeURIComponent(`/organize${root ? `?root=${root.id}` : ''}`)}`}>כניסה</Link>
            </Say>
          ) : plan.length > 0 ? (
            <>
              <Field label="כותרת להצעה (לא חובה)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} dir="auto" />
              <Field label="למה? (לבודקים)" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={2000} dir="auto" />
              <p className="faint sm">שינויים בסטים עצמם נבדקים בידי שומרי האתר; שינויים בספרים ובשיחות בידי שומרי הסט.</p>
              <div className="btns">
                <Button look="outline" onClick={() => run('preview')} disabled={busy}>
                  לראות מה ישתנה
                </Button>
                <Button onClick={() => run('send')} disabled={busy}>
                  {busy ? 'רגע…' : 'שליחה לבדיקה'}
                </Button>
              </div>
            </>
          ) : null}
        </Panel>
      </main>

      <Sheet open={dialog?.kind === 'move' || dialog?.kind === 'merge'} title={dialog?.kind === 'merge' ? 'מיזוג אל הפריט שנשאר' : 'לאן להעביר?'} onClose={() => setDialog(null)}>
        {(dialog?.kind === 'move' || dialog?.kind === 'merge') && (
          <Picker
            label={pickType === 'set' ? 'חיפוש סט לפי שם' : pickType === 'work' ? 'חיפוש ספר לפי שם' : 'חיפוש לפי שם'}
            type={pickType}
            quick={quick}
            exclude={chosen}
            top={dialog.kind === 'move' && onlySets ? 'לראש הספרייה (בלי סט מעל)' : undefined}
            keep={dialog.kind === 'move' && inSet && !onlySets ? 'להשאיר גם בסט הזה' : undefined}
            onPick={(to, label, keep) => {
              if (to) setNames((n) => ({ ...n, [to]: label }));
              if (dialog.kind === 'merge') add({ op: 'merge', from: chosen[0]!, into: to! });
              else if (onlySets || !inSet) add({ op: 'move', items: chosen, to });
              else add({ op: 'move', items: chosen, to, ...(keep ? {} : { from: root!.id }) });
              setDialog(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={!!rename} title="שינוי שם" onClose={() => setDialog(null)}>
        {rename && (
          <RenameForm
            node={rename}
            onDone={(name, slug) => {
              add({ op: 'rename', item: rename.id, ...(name ? { name } : {}), ...(slug ? { slug } : {}) });
              setDialog(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={dialog?.kind === 'new-set'} title={chosen.length ? `סט חדש, עם ${chosen.length} שנבחרו` : 'סט חדש'} onClose={() => setDialog(null)}>
        {dialog?.kind === 'new-set' && (
          <NewSetForm
            onDone={(name, slug) => {
              const key = `s${steps.length + 1}`;
              setNames((n) => ({ ...n, [`new:${key}`]: name.he }));
              add({ op: 'create-set', key, name, slug, parent: root?.type === 'set' ? root.id : null, ...(chosen.length ? { items: chosen } : {}) });
              setDialog(null);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

/** A row's new name and address. The old address keeps leading to the new one. */
function RenameForm({ node, onDone }: { node: TreeNode; onDone: (name: { he: string; en: string } | null, slug: string | null) => void }) {
  const names = (node.name ?? {}) as { he?: string; en?: string };
  const [he, setHe] = useState(names.he ?? '');
  const [en, setEn] = useState(names.en ?? '');
  const lastPart = node.path ? node.path.slice(node.path.lastIndexOf('/') + 1) : '';
  const [slug, setSlug] = useState(lastPart);
  const nameChanged = he.trim() !== (names.he ?? '') || en.trim() !== (names.en ?? '');
  const slugChanged = !!node.path && slug !== lastPart;
  const slugOk = !slugChanged || (slug.length > 0 && slugOf(slug) === slug);
  const ok = !!he.trim() && slugOk && (nameChanged || slugChanged);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onDone(nameChanged ? { he: he.trim(), en: en.trim() } : null, slugChanged ? slug : null);
      }}
    >
      <Field label="שם בעברית" value={he} onChange={(e) => setHe(e.target.value)} required maxLength={300} dir="rtl" />
      <Field label="שם באנגלית" value={en} onChange={(e) => setEn(e.target.value)} maxLength={300} dir="ltr" />
      {node.path && <Field label="כתובת (אותיות לטיניות)" hint="הכתובת הישנה תוביל לחדשה." value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={80} dir="ltr" aria-invalid={!slugOk} />}
      <div className="btns">
        <Button type="submit" small disabled={!ok}>
          הוספה לשינויים
        </Button>
      </div>
    </form>
  );
}

/** A new set's names and address, made from the English name until it is typed. */
function NewSetForm({ onDone }: { onDone: (name: { he: string; en?: string }, slug: string) => void }) {
  const [he, setHe] = useState('');
  const [en, setEn] = useState('');
  const [typed, setTyped] = useState<string | null>(null);
  const slug = typed ?? slugOf(en);
  const ok = !!he.trim() && !!slug && slugOf(slug) === slug;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onDone({ he: he.trim(), ...(en.trim() ? { en: en.trim() } : {}) }, slug);
      }}
    >
      <Field label="שם בעברית" value={he} onChange={(e) => setHe(e.target.value)} required maxLength={300} dir="rtl" />
      <Field label="שם באנגלית" value={en} onChange={(e) => setEn(e.target.value)} maxLength={300} dir="ltr" />
      <Field label="כתובת (אותיות לטיניות)" hint={<bdi dir="ltr">/sets/{slug || '…'}</bdi>} value={slug} onChange={(e) => setTyped(e.target.value.toLowerCase())} maxLength={80} required dir="ltr" />
      <div className="btns">
        <Button type="submit" small disabled={!ok}>
          הוספה לשינויים
        </Button>
      </div>
    </form>
  );
}

const short = (value: unknown) => {
  const text = value === undefined || value === null ? '—' : typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
};

/** The change before it is sent: each item before and after, and the addresses that will lead to their new place. */
function PreviewList({ preview }: { preview: Preview }) {
  return (
    <div className="orgpreview">
      <h3>{preview.title}</h3>
      <p className="faint sm">
        {preview.items.length} פריטים ישתנו{preview.redirects.length ? ` · ${preview.redirects.length} כתובות ישנות יובילו למקום החדש` : ''}
      </p>
      {preview.items.slice(0, 100).map((item) => (
        <div key={item.id} className="diff">
          <b>{item.name}</b> <span className="faint sm">{KINDS[item.type] ?? item.type}</span>
          {item.isNew && <span className="faint sm"> · חדש</span>}
          {item.deleted && <span className="faint sm"> · יימחק</span>}
          {item.pathBefore !== item.path && (
            <div dir="ltr" className="sm">
              <del>{item.pathBefore ?? '—'}</del> <ins>{item.path ?? '—'}</ins>
            </div>
          )}
          {item.changes.slice(0, 6).map((c) => (
            <div key={c.path} dir="ltr" className="sm">
              <span className="faint">{c.path}</span> <del>{short(c.before)}</del> <ins>{short(c.after)}</ins>
            </div>
          ))}
        </div>
      ))}
      {preview.warnings.length > 0 && (
        <Say>
          {preview.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </Say>
      )}
    </div>
  );
}
