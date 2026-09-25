import { useEffect, useMemo, useRef, useState } from 'react';
import { HDate } from '@hebcal/core';
import type { ReactNode } from 'react';
import type { CatalogEntry, LibraryCollection, LibraryItemBase } from '@sichos-kodesh/catalog';
import type { AppRelease, Meta, PrebuiltPack, SizeResult, WorksShelf } from './api';
import { api } from './api';
import type { CartItem, CartSettings } from './cart';
import { addItem, cartQuery, hasItem, itemHasAudio, itemKey, itemLabel, loadCart, removeItem, saveCart, yearsText } from './cart';
import type { Kvius } from './kvius';
import { currentMonths, kviusOf, monthName } from './kvius';
import type { CustomSections, Preset } from './selection';
import { COLLECTIONS, DEFAULT_CUSTOM, MONTHS, axesOf, collectionInfo, formatMb, ltr, monthsOf, orderProfiles, profileInfo, yearLabel } from './selection';
import { BookIcon, CalendarIcon, CartIcon, CheckIcon, CloseIcon, DownloadIcon, FolderIcon, HeadphonesIcon, LibraryIcon, OnwardIcon, PackageIcon, PhoneIcon, PlusIcon, ShieldIcon } from './icons';

/** The web version of the app. */
const WEB_APP_URL = 'https://sichoskodesh.vercel.app';
/** Where the app was before the app server had a release of its own: its links go there until the first one is published. */
const GITHUB_RELEASES_URL = 'https://github.com/shmuky/Sichos-Kodesh/releases/latest';

const PRESETS: Array<{ value: Preset; label: string; note: string }> = [
  { value: 'essentials', label: 'העיקר', note: 'ההקלטות וההנחות - מה שעמוד ההתוועדות נפתח בו.' },
  { value: 'everything', label: 'הכל', note: 'ההקלטות וההנחות, ועמן המוגה, המאמרים, ההגהות וההוספות.' },
  { value: 'custom', label: 'בחירה', note: 'בוחרים בדיוק מה ייכנס מכל התוועדות.' },
];

const CUSTOM_LABELS: Array<[keyof CustomSections, string]> = [
  ['audio', 'הקלטות'],
  ['sichosKodesh', 'הנחות - שיחות קודש'],
  ['torasMenachem', 'הנחות - תורת מנחם'],
  ['mugah', 'מוגה'],
  ['maamorim', 'מאמרים'],
  ['hagahos', 'הגהות'],
  ['hosofos', 'הוספות'],
];

const PART_SIZES = [100, 200, 500, 1000, 2000];

type Load<T> = { state: 'loading' } | { state: 'ready'; value: T } | { state: 'error'; message: string };

function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): Load<T> {
  const [result, setResult] = useState<Load<T>>({ state: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: 'loading' });
    load(controller.signal)
      .then((value) => setResult({ state: 'ready', value }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ state: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists what the load depends on
  }, deps);
  return result;
}

function partSizeLabel(mb: number): string {
  return ltr(mb >= 1000 ? `${mb / 1000} GB` : `${mb} MB`);
}

function counted(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n.toLocaleString('he-IL')} ${many}`;
}

function toggled<T>(list: T[], value: T, on: boolean): T[] {
  return on ? (list.includes(value) ? list : [...list, value]) : list.filter((v) => v !== value);
}

/** A pick-one row of pills, the chosen one filled (the app's segmented control). */
function Segmented<T extends string | number>({ name, value, options, onChange }: { name: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((option) => (
        <label key={String(option.value)} className={option.value === value ? 'segmented-option segmented-on' : 'segmented-option'}>
          <input type="radio" className="visually-hidden" name={name} id={`${name}-${option.value}`} checked={option.value === value} onChange={() => onChange(option.value)} />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/** A chip that toggles a choice in a set (a year, a month, a group). `mark` flags it: a kvius year, this month. */
function ToggleChip({ id, on, onChange, mark, title, children }: { id: string; on: boolean; onChange: (on: boolean) => void; mark?: 'kvius' | 'now'; title?: string; children: ReactNode }) {
  const className = ['chip', 'chip-check', on ? 'chip-on' : '', mark === 'kvius' ? 'chip-kvius' : '', mark === 'now' ? 'chip-now' : ''].filter(Boolean).join(' ');
  return (
    <label className={className} title={title}>
      <input type="checkbox" className="visually-hidden" id={id} checked={on} onChange={(event) => onChange(event.target.checked)} />
      <span className="chip-tick" aria-hidden="true">
        <CheckIcon size={14} />
      </span>
      {children}
    </label>
  );
}

function Field({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field" role="group" aria-label={title}>
      <div className="field-title">{title}</div>
      {hint && <p className="field-hint">{hint}</p>}
      {children}
    </div>
  );
}

function DownloadButton({ href, file, label = 'הורדה' }: { href: string; file?: string; label?: string }) {
  return (
    <a className="download-button" href={href} download={file ?? true}>
      <DownloadIcon size={18} />
      {label}
    </a>
  );
}

/** Add to the cart, or - once it is there - say so and take it out on a second tap. */
function AddButton({ inCart, disabled, onAdd, onRemove, label = 'הוספה לסל', detail }: { inCart: boolean; disabled?: boolean; onAdd: () => void; onRemove?: () => void; label?: string; detail?: string }) {
  // "Add" becomes "In the cart"; a named offer (this month's kvius) keeps its name and says it underneath.
  const generic = label.startsWith('הוספה');
  const shownDetail = inCart && !generic ? ['בסל', detail].filter(Boolean).join(' · ') : detail;
  return (
    <button type="button" className={inCart ? 'add-button add-button-in' : 'add-button'} disabled={disabled} onClick={inCart ? onRemove : onAdd} aria-pressed={inCart}>
      {inCart ? <CheckIcon size={18} /> : <PlusIcon size={18} />}
      <span className="add-button-text">
        <span>{inCart && generic ? 'בסל' : label}</span>
        {shownDetail && <span className="add-button-detail">{shownDetail}</span>}
      </span>
    </button>
  );
}

function Hero({ meta }: { meta: Load<Meta> }) {
  const flow = [
    { icon: <PlusIcon size={22} />, label: 'מוסיפים לסל' },
    { icon: <DownloadIcon size={22} />, label: 'מורידים חבילה אחת' },
    { icon: <PhoneIcon size={22} />, label: 'מעתיקים לטלפון' },
  ];
  return (
    <section className="hero">
      <p className="eyebrow">חבילות להורדה</p>
      <h1 className="hero-title">הכל בטלפון, גם בלי אינטרנט</h1>
      <p className="hero-lead">בוחרים מהמדפים - התוועדויות לפי שנים וחודשים, לקוטי שיחות, מאמרים, יומנים ומכתבים, והספרים עצמם - מוסיפים לסל, ומורידים הכל בחבילה אחת חתומה. האפליקציה מכניסה אותה בלי חיבור.</p>
      <ol className="flow">
        {flow.map((step, index) => (
          <li key={step.label} className="flow-step">
            <span className="flow-well">{step.icon}</span>
            <span className="flow-label">{step.label}</span>
            {index < flow.length - 1 && (
              <span className="flow-onward" aria-hidden="true">
                <OnwardIcon size={16} />
              </span>
            )}
          </li>
        ))}
      </ol>
      {meta.state === 'ready' && (
        <ul className="facts" aria-label="בארכיון">
          <li>{counted(meta.value.objects, 'קובץ אחד', 'קבצים')}</li>
          <li>{ltr(formatMb(meta.value.bytes))}</li>
          <li>{meta.value.years.length <= 3 ? `שנים: ${yearsText(meta.value.years)}` : `${meta.value.years.length} שנים, ${yearLabel(meta.value.years[0]!)}–${yearLabel(meta.value.years[meta.value.years.length - 1]!)}`}</li>
          <li>עודכן {new HDate(new Date(meta.value.publishedAt)).renderGematriya(true)}</li>
        </ul>
      )}
    </section>
  );
}

/** This year's kvius: its years, and the farbrengens of this month, next month or the whole years in one tap. */
function KviusCard({ kvius, months, cart, onAdd, onRemove }: { kvius: Kvius; months: { now: string; next: string }; cart: CartItem[]; onAdd: (item: CartItem) => void; onRemove: (item: CartItem) => void }) {
  const offers: Array<{ label: string; item: CartItem }> = [
    { label: `${monthName(months.now)}, החודש`, item: { kind: 'farbrengens', years: kvius.years, months: [months.now], kvius: true } },
    { label: `${monthName(months.next)}, החודש הבא`, item: { kind: 'farbrengens', years: kvius.years, months: [months.next], kvius: true } },
    { label: 'השנה כולה', item: { kind: 'farbrengens', years: kvius.years, months: [], kvius: true } },
  ];
  return (
    <section className="card kvius" aria-labelledby="kvius-title">
      <div className="kvius-head">
        <span className="kvius-mark" aria-hidden="true">
          <CalendarIcon size={22} />
        </span>
        <div className="kvius-text">
          <p className="eyebrow">קביעות השנה · {yearLabel(kvius.year)}</p>
          <h2 id="kvius-title" className="kvius-title">
            {kvius.years.length > 0 ? `${kvius.years.map(yearLabel).join(', ')}: אותו לוח כמו השנה` : 'שנות הקביעות של השנה עוד לא בארכיון'}
          </h2>
          <p className="kvius-lead">אותם ימים בשבוע, אותן פרשיות (קביעות {kvius.code}). האפליקציה מלווה אותן שבוע אחר שבוע; כאן מוסיפים אותן לסל בנגיעה.</p>
        </div>
      </div>
      {kvius.years.length > 0 && (
        <div className="kvius-offers">
          {offers.map((offer) => (
            <AddButton key={offer.label} inCart={hasItem(cart, offer.item)} onAdd={() => onAdd(offer.item)} onRemove={() => onRemove(offer.item)} label={offer.label} detail={kvius.years.length === 1 ? yearLabel(kvius.years[0]!) : `${kvius.years.length} שנים`} />
          ))}
        </div>
      )}
    </section>
  );
}

/** The farbrengens shelf: years and months, the same months of every year picked. */
function FarbrengensShelf({ meta, kvius, months: current, cart, onAdd, onRemove }: { meta: Meta; kvius: Kvius; months: { now: string; next: string }; cart: CartItem[]; onAdd: (item: CartItem) => void; onRemove: (item: CartItem) => void }) {
  const kviusYears = new Set(kvius.years);
  const [years, setYears] = useState<number[]>(() => (kvius.years.length > 0 ? [...kvius.years] : [meta.years[meta.years.length - 1]!]));
  const [months, setMonths] = useState<string[]>([]);
  const single = years.length === 1 ? years[0]! : null;
  const year = useLoad<CatalogEntry[] | null>((signal) => (single ? api.catalogYear(single, signal) : Promise.resolve(null)), [single]);
  const monthOptions = useMemo(() => (single && year.state === 'ready' && year.value ? monthsOf(year.value) : MONTHS.map((m) => ({ token: m.key, name: m.name, occasions: 0 }))), [single, year]);
  const sorted = [...years].sort((a, b) => a - b);
  const item: CartItem = { kind: 'farbrengens', years: sorted, months: MONTHS.filter((m) => months.includes(m.key)).map((m) => m.key) };
  const inCart = hasItem(cart, item);
  const allYears = years.length === meta.years.length;
  const onlyKvius = kvius.years.length > 0 && years.length === kvius.years.length && years.every((y) => kviusYears.has(y));
  const summary = `${item.months.length === 0 ? 'השנה כולה' : item.months.map(monthName).join(', ')} · ${years.length === 1 ? yearLabel(years[0]!) : `${years.length} שנים`}`;

  return (
    <div className="shelf-body">
      <Field title="שנים" hint="אפשר כמה שנים: אותם חודשים מכל אחת.">
        <div className="chips" role="group" aria-label="שנים">
          <ToggleChip id="years-all" on={allYears} onChange={(on) => setYears(on ? [...meta.years] : [meta.years[meta.years.length - 1]!])}>
            כל השנים
          </ToggleChip>
          {kvius.years.length > 0 && (
            <ToggleChip id="years-kvius" on={onlyKvius} mark="kvius" onChange={(on) => on && setYears([...kvius.years])} title={`שנים שהלוח שלהן כמו ${yearLabel(kvius.year)}`}>
              {kvius.years.length === 1 ? 'שנת הקביעות' : 'שנות הקביעות'}
            </ToggleChip>
          )}
          {meta.years.map((y) => (
            <ToggleChip
              key={y}
              id={`year-${y}`}
              on={years.includes(y)}
              mark={kviusYears.has(y) ? 'kvius' : undefined}
              title={kviusYears.has(y) ? `שנת קביעות: הלוח שלה כמו ${yearLabel(kvius.year)}` : undefined}
              onChange={(on) => {
                const next = toggled(years, y, on);
                if (next.length > 0) setYears(next);
              }}
            >
              {yearLabel(y)}
            </ToggleChip>
          ))}
        </div>
        {kvius.years.length > 0 && (
          <p className="legend">
            <span className="legend-dot legend-kvius" aria-hidden="true" /> שנת קביעות: הלוח שלה כמו השנה
          </p>
        )}
      </Field>

      <Field title="חודשים" hint={single ? 'המספר ליד כל חודש: כמה התוועדויות היו בו.' : undefined}>
        <div className="chips" role="group" aria-label="חודשים">
          <ToggleChip id="months-all" on={months.length === 0} onChange={() => setMonths([])}>
            השנה כולה
          </ToggleChip>
          {monthOptions.map((month) => (
            <ToggleChip
              key={month.token}
              id={`month-${month.token}`}
              on={months.includes(month.token)}
              mark={month.token === current.now ? 'now' : undefined}
              onChange={(on) => setMonths(toggled(months, month.token, on))}
            >
              {month.name}
              {month.token === current.now && <span className="chip-flag">החודש</span>}
              {month.token === current.next && <span className="chip-flag chip-flag-soft">הבא</span>}
              {single && <span className="chip-count">{month.occasions}</span>}
            </ToggleChip>
          ))}
        </div>
        {single && year.state === 'loading' && <p className="field-hint">טוען את חודשי השנה…</p>}
      </Field>

      <div className="shelf-action">
        <AddButton inCart={inCart} onAdd={() => onAdd(item)} onRemove={() => onRemove(item)} detail={summary} />
      </div>
    </div>
  );
}

/** A library collection, browsed as the app browses it: an axis, then any of its groups - or all of it. */
function LibraryShelf({ meta, cart, onAdd, onRemove }: { meta: Meta; cart: CartItem[]; onAdd: (item: CartItem) => void; onRemove: (item: CartItem) => void }) {
  const offered = COLLECTIONS.filter((c) => c.id !== 'farbrengens' && meta.library?.includes(c.id));
  const [collection, setCollection] = useState(offered[0]?.id ?? '');
  const data = useLoad<LibraryCollection<LibraryItemBase> | null>((signal) => (collection ? api.library(collection, signal) : Promise.resolve(null)), [collection]);
  const axes = useMemo(() => (data.state === 'ready' && data.value ? axesOf(data.value.groups) : []), [data]);
  const [axis, setAxis] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  // Each collection opens on its first axis, as the app's browser does.
  useEffect(() => {
    setAxis(axes[0]?.id ?? null);
    setPicked([]);
  }, [axes]);

  if (offered.length === 0) return <p className="shelf-empty">הספרייה עוד לא בארכיון: היא מתמלאת בימים אלה.</p>;
  const info = collectionInfo(collection);
  const groups = data.state === 'ready' && data.value && axis ? (data.value.groups[axis] ?? []) : [];
  const chosen = groups.filter((g) => picked.includes(g.slug));
  const item: CartItem = axis && chosen.length > 0 ? { kind: 'library', collection, axis, groups: chosen.map((g) => ({ slug: g.slug, name: g.name })) } : { kind: 'library', collection, axis: null, groups: [] };
  const whole = !axis;

  return (
    <div className="shelf-body">
      <div className="subtabs" role="radiogroup" aria-label="אוסף">
        {offered.map((c) => (
          <label key={c.id} className={collection === c.id ? 'subtab subtab-on' : 'subtab'}>
            <input type="radio" className="visually-hidden" name="collection" id={`collection-${c.id}`} checked={collection === c.id} onChange={() => setCollection(c.id)} />
            {c.name}
          </label>
        ))}
      </div>
      {data.state === 'loading' && (
        <div className="loading">
          <span className="spinner" aria-hidden="true" />
          טוענים את {info.name}…
        </div>
      )}
      {data.state === 'error' && <p className="error">{data.message}</p>}
      {data.state === 'ready' && data.value && (
        <>
          <Field title="איך בוחרים" hint={`${counted(data.value.items.length, info.one, info.many)}, מסודרים כמו באפליקציה.`}>
            <div className="chips" role="radiogroup" aria-label="איך בוחרים">
              {[...axes.map((a) => ({ value: a.id, label: a.name })), { value: '', label: `כל ה${info.many}` }].map((option) => (
                <label key={option.value || 'all'} className={(axis ?? '') === option.value ? 'chip chip-on' : 'chip'}>
                  <input
                    type="radio"
                    className="visually-hidden"
                    name="axis"
                    id={`axis-${option.value || 'all'}`}
                    checked={(axis ?? '') === option.value}
                    onChange={() => {
                      setAxis(option.value || null);
                      setPicked([]);
                    }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </Field>
          {axis && (
            <Field title={axes.find((a) => a.id === axis)?.name.replace(/^לפי /, '') ?? ''} hint={`אפשר כמה. המספר: כמה ${info.many} יש בכל אחד.`}>
              <div className="chips chips-scroll" role="group" aria-label="קבוצות">
                {groups.map((group) => (
                  <ToggleChip key={group.slug} id={`group-${group.slug}`} on={picked.includes(group.slug)} onChange={(on) => setPicked(toggled(picked, group.slug, on))}>
                    {group.name}
                    <span className="chip-count">{group.itemIds.length}</span>
                  </ToggleChip>
                ))}
              </div>
            </Field>
          )}
          <div className="shelf-action">
            <AddButton
              inCart={hasItem(cart, item)}
              disabled={!whole && chosen.length === 0}
              onAdd={() => onAdd(item)}
              onRemove={() => onRemove(item)}
              detail={whole ? `כל ה${info.many}` : chosen.length === 0 ? 'בוחרים קודם' : `${info.name}: ${chosen.length <= 3 ? chosen.map((g) => g.name).join(', ') : `${chosen.length} קבוצות`}`}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** The seforim, in bundles: each added as a whole, with the full text and search. */
function WorksShelfView({ shelf, cart, onAdd, onRemove }: { shelf: WorksShelf; cart: CartItem[]; onAdd: (item: CartItem) => void; onRemove: (item: CartItem) => void }) {
  const titles = new Map(shelf.works.map((w) => [w.id, w.title.he]));
  return (
    <div className="shelf-body">
      <p className="field-hint">כל ספר עם הטקסט המלא והחיפוש, לקריאה בלי אינטרנט. הם נכנסים לאותה חבילה עם כל השאר.</p>
      <div className="bundles">
        {shelf.bundles.map((bundle) => {
          const item: CartItem = { kind: 'works', bundle: bundle.id, name: bundle.label.he };
          return (
            <article key={bundle.id} className="bundle">
              <span className="bundle-icon" aria-hidden="true">
                <BookIcon size={20} />
              </span>
              <div className="bundle-text">
                <h3 className="bundle-name">{bundle.label.he}</h3>
                <p className="bundle-works">{bundle.works.map((id) => titles.get(id) ?? id).join(' · ')}</p>
                <p className="bundle-size">{ltr(formatMb(bundle.bytes))}</p>
              </div>
              <AddButton inCart={hasItem(cart, item)} onAdd={() => onAdd(item)} onRemove={() => onRemove(item)} label="הוספה" />
            </article>
          );
        })}
      </div>
    </div>
  );
}

type ShelfId = 'farbrengens' | 'library' | 'works';

function Shelves({ meta, shelf, kvius, months, cart, onAdd, onRemove }: { meta: Meta; shelf: WorksShelf | null; kvius: Kvius; months: { now: string; next: string }; cart: CartItem[]; onAdd: (item: CartItem) => void; onRemove: (item: CartItem) => void }) {
  const tabs: Array<{ id: ShelfId; name: string; icon: ReactNode }> = [
    { id: 'farbrengens', name: 'התוועדויות', icon: <HeadphonesIcon size={18} /> },
    ...((meta.library?.length ?? 0) > 0 ? [{ id: 'library' as const, name: 'הספרייה', icon: <LibraryIcon size={18} /> }] : []),
    ...(shelf ? [{ id: 'works' as const, name: 'ספרים', icon: <BookIcon size={18} /> }] : []),
  ];
  const [tab, setTab] = useState<ShelfId>('farbrengens');
  return (
    <section className="card shelves" aria-labelledby="shelves-title">
      <h2 id="shelves-title" className="visually-hidden">
        המדפים
      </h2>
      <div className="shelf-tabs" role="tablist" aria-label="מדפים">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} className={tab === t.id ? 'shelf-tab shelf-tab-on' : 'shelf-tab'} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.name}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'farbrengens' && <FarbrengensShelf meta={meta} kvius={kvius} months={months} cart={cart} onAdd={onAdd} onRemove={onRemove} />}
        {tab === 'library' && <LibraryShelf meta={meta} cart={cart} onAdd={onAdd} onRemove={onRemove} />}
        {tab === 'works' && shelf && <WorksShelfView shelf={shelf} cart={cart} onAdd={onAdd} onRemove={onRemove} />}
      </div>
    </section>
  );
}

/** "3 התוועדויות · 2 ספרים · 120 קבצים", leaving out what the pack has none of. */
function countsLine(items: number, works: number, files?: number): string {
  const parts: string[] = [];
  if (items > 0) parts.push(counted(items, 'פריט אחד', 'פריטים'));
  if (works > 0) parts.push(counted(works, 'ספר אחד', 'ספרים'));
  if (files !== undefined) parts.push(counted(files, 'קובץ אחד', 'קבצים'));
  return parts.join(' · ');
}

/** The pack API's refusals, in the site's words. */
function sizeError(message: string): string {
  if (/holds nothing|not in the published archive|no seforim/.test(message)) return 'את זה הארכיון עוד לא מחזיק: הוא מתמלא בימים אלה. אפשר להוריד מהסל את מה שחסר, או לחזור מאוחר יותר.';
  return `לא הצלחנו לחשב את הגודל (${message}). נסו שוב בעוד רגע.`;
}

/** One cart line's own size, with the cart's settings. */
function LineSize({ query }: { query: string | null }) {
  const size = useLoad<SizeResult | null>((signal) => (query ? api.size(query, signal) : Promise.resolve(null)), [query]);
  if (!query) return null;
  if (size.state === 'loading') return <span className="line-size line-size-wait">…</span>;
  if (size.state === 'error' || !size.value) return <span className="line-size line-size-missing">עוד לא בארכיון</span>;
  return <span className="line-size">{ltr(formatMb(size.value.bytes))}</span>;
}

function Cart({ meta, cart, settings, onSettings, onRemove, onClear }: { meta: Meta; cart: CartItem[]; settings: CartSettings; onSettings: (patch: Partial<CartSettings>) => void; onRemove: (key: string) => void; onClear: () => void }) {
  const profiles = useMemo(() => orderProfiles(meta.profiles), [meta.profiles]);
  const query = cartQuery(cart, settings);
  const size = useLoad<SizeResult | null>((signal) => (query ? api.size(query, signal) : Promise.resolve(null)), [query]);
  const hasFarbrengens = cart.some((i) => i.kind === 'farbrengens');
  const hasAudio = cart.some(itemHasAudio);
  const preset = PRESETS.find((p) => p.value === settings.preset)!;

  return (
    <aside className="card cart" id="cart" aria-labelledby="cart-title">
      <div className="cart-head">
        <CartIcon size={20} />
        <h2 id="cart-title" className="cart-title">
          הסל
        </h2>
        {cart.length > 0 && <span className="cart-count">{cart.length}</span>}
        {cart.length > 0 && (
          <button type="button" className="text-button" onClick={onClear}>
            ריקון
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <p className="cart-empty">הסל ריק. מוסיפים מהמדפים - שנים וחודשים, חלקים ושנים מהספרייה, ספרים - והכל יורד בחבילה אחת.</p>
      ) : (
        <>
          <ul className="cart-lines">
            {cart.map((item) => {
              const label = itemLabel(item);
              const key = itemKey(item);
              return (
                <li key={key} className="cart-line">
                  <div className="cart-line-text">
                    <span className="cart-line-title">{label.title}</span>
                    <span className="cart-line-detail">{label.detail}</span>
                  </div>
                  <LineSize query={cartQuery([item], settings)} />
                  <button type="button" className="icon-button" onClick={() => onRemove(key)} aria-label={`להוציא מהסל: ${label.title}`}>
                    <CloseIcon size={16} />
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="cart-settings">
            {hasFarbrengens && (
              <Field title="מה מכל התוועדות">
                <Segmented name="preset" value={settings.preset} options={PRESETS.map(({ value, label }) => ({ value, label }))} onChange={(value) => onSettings({ preset: value })} />
                <p className="field-hint">{preset.note}</p>
                {settings.preset === 'custom' && (
                  <div className="chips">
                    {CUSTOM_LABELS.map(([key, label]) => (
                      <ToggleChip key={key} id={`section-${key}`} on={settings.custom[key]} onChange={(on) => onSettings({ custom: { ...settings.custom, [key]: on } })}>
                        {label}
                      </ToggleChip>
                    ))}
                  </div>
                )}
              </Field>
            )}
            {hasAudio && profiles.length > 1 && (
              <Field title="איכות השמע">
                <Segmented name="profile" value={settings.profile} options={profiles.map((p) => ({ value: p, label: profileInfo(p).name }))} onChange={(value) => onSettings({ profile: value })} />
                <p className="field-hint">{profileInfo(settings.profile).note}</p>
              </Field>
            )}
            <Field title="גודל קובץ מרבי" hint="חבילה גדולה יותר מתחלקת לכמה קבצים.">
              <Segmented name="max" value={settings.maxMb} options={PART_SIZES.map((mb) => ({ value: mb, label: partSizeLabel(mb) }))} onChange={(value) => onSettings({ maxMb: value })} />
            </Field>
          </div>

          <div className="cart-total" aria-live="polite">
            {!query && <p className="error">בחרו לפחות סוג תוכן אחד להתוועדויות.</p>}
            {query && size.state === 'loading' && (
              <div className="result-loading">
                <span className="spinner" aria-hidden="true" />
                מחשבים את הגודל…
              </div>
            )}
            {query && size.state === 'error' && <p className="error">{sizeError(size.message)}</p>}
            {size.state === 'ready' && size.value && (
              <>
                <div className="result-head">
                  <p className="eyebrow">החבילה</p>
                  <p className="result-size">{ltr(formatMb(size.value.bytes))}</p>
                  <p className="result-counts">{countsLine(size.value.occasions, size.value.works ?? 0, size.value.objects)}</p>
                </div>
                {size.value.missing > 0 && <p className="note">{counted(size.value.missing, 'קובץ אחד עדיין אינו', 'קבצים עדיין אינם')} בארכיון, ולא ייכללו.</p>}
                {size.value.signed ? (
                  <p className="signed">
                    <ShieldIcon size={16} />
                    חתומה: האפליקציה בודקת כל קובץ לפני שהוא נכנס.
                  </p>
                ) : (
                  <p className="error">שרת זה אינו חותם על חבילות: האפליקציה תקבל את הקבצים אחד-אחד.</p>
                )}
                <ul className="rows">
                  {size.value.parts.map((part) => (
                    <li key={part.index} className="row">
                      <div className="row-text">
                        <span className="row-title">{size.value && size.value.parts.length > 1 ? `חלק ${part.index + 1} מתוך ${size.value.parts.length}` : 'חבילה אחת'}</span>
                        <span className="row-note">
                          {countsLine(part.occasions, part.works ?? 0)} · {ltr(formatMb(part.bytes))}
                        </span>
                      </div>
                      <DownloadButton href={api.buildUrl(query!, part.index + 1)} file={part.file} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

/** On a phone the cart sits below the shelves: a bar at the bottom says what is in it and leads there. */
function CartBar({ cart, onOpen }: { cart: CartItem[]; onOpen: () => void }) {
  if (cart.length === 0) return null;
  return (
    <div className="cart-bar">
      <button type="button" className="cart-bar-button" onClick={onOpen}>
        <CartIcon size={18} />
        <span>{counted(cart.length, 'פריט אחד בסל', 'פריטים בסל')}</span>
        <span className="cart-bar-go">לסל ולהורדה</span>
      </button>
    </div>
  );
}

/** The prebuilt packs, one card to a month, each quality a row: the recommended one first. */
function ReadyPacks({ packs }: { packs: PrebuiltPack[] }) {
  const groups = useMemo(() => {
    const byScope = new Map<string, PrebuiltPack[]>();
    for (const pack of packs) {
      const key = pack.scope.label.he;
      byScope.set(key, [...(byScope.get(key) ?? []), pack]);
    }
    return [...byScope.entries()].map(([label, list]) => {
      const order = orderProfiles([...new Set(list.map((p) => p.profile))]);
      return { label, packs: [...list].sort((a, b) => order.indexOf(a.profile) - order.indexOf(b.profile) || (a.part?.index ?? 0) - (b.part?.index ?? 0)) };
    });
  }, [packs]);

  if (groups.length === 0) return null;
  return (
    <div className="pack-grid">
      {groups.map((group) => (
        <article key={group.label} className="card pack-card">
          <header className="pack-card-head">
            <span className="pack-well">
              <PackageIcon size={20} />
            </span>
            <h3 className="pack-card-title">{group.label}</h3>
          </header>
          <ul className="rows">
            {group.packs.map((pack, index) => {
              const info = profileInfo(pack.profile);
              return (
                <li key={pack.file} className="row">
                  <div className="row-text">
                    <span className="row-title">
                      {info.name}
                      {pack.part && pack.part.count > 1 && <span className="row-part"> · חלק {pack.part.index + 1} מתוך {pack.part.count}</span>}
                      {index === 0 && group.packs.length > 1 && <span className="badge">מומלץ</span>}
                    </span>
                    <span className="row-note">
                      {ltr(formatMb(pack.bytes))} · {info.note}
                    </span>
                  </div>
                  <DownloadButton href={api.packUrl(pack.file)} file={pack.file} />
                </li>
              );
            })}
          </ul>
        </article>
      ))}
    </div>
  );
}

/** A link to the app's file for one ABI: the app server's, or the GitHub releases while the server has none published (latest.json fails). */
function appHref(release: Load<AppRelease>, abi: string): string {
  return release.state === 'error' ? GITHUB_RELEASES_URL : api.appDownloadUrl(abi);
}

/** The phone app itself, from the app server - the newest release, whichever it is. */
function AppDownload({ release }: { release: Load<AppRelease> }) {
  const file = (abi: string) => (release.state === 'ready' ? release.value.files.find((f) => f.abi === abi) : undefined);
  const main = file('arm64-v8a');
  return (
    <div className="card app-card">
      <span className="app-well" aria-hidden="true">
        <PhoneIcon size={24} />
      </span>
      <div className="app-text">
        <h3 className="app-title">האפליקציה לאנדרואיד</h3>
        <p className="app-note">
          {release.state === 'ready' ? `גרסה ${release.value.version}` : 'הגרסה החדשה ביותר'}
          {main && <> · {ltr(formatMb(main.bytes))}</>}. מותקנת מעל גרסה קודמת, עם כל ההורדות וההגדרות, והאפליקציה מודיעה בעצמה כשיוצאת גרסה חדשה.
        </p>
        <p className="app-alt">
          <a href={appHref(release, 'armeabi-v7a')}>לטלפון ישן (32 ביט)</a> · <a href={appHref(release, 'universal')}>קובץ אחד לכל טלפון</a>
        </p>
      </div>
      <DownloadButton href={appHref(release, 'arm64-v8a')} label="הורדת האפליקציה" />
    </div>
  );
}

function ImportSteps() {
  const steps = [
    { icon: <FolderIcon size={20} />, title: 'בוחרים תיקייה באפליקציה', body: 'הגדרות ← חבילות לא מקוונות ← בוחרים תיקייה. מומלץ Documents/SichosKodesh.' },
    { icon: <PackageIcon size={20} />, title: 'מעתיקים את החבילה', body: 'את קובץ ה-‎.skpack לתיקיית import שבתוכה: בכבל, מכרטיס זיכרון או מכל מקום אחר.' },
    { icon: <PhoneIcon size={20} />, title: 'פותחים את האפליקציה', body: 'החבילה נכנסת מעצמה. כל קובץ נבדק, ומה שכבר יש בטלפון מדולג.' },
  ];
  return (
    <>
      <ol className="import-steps">
        {steps.map((step, index) => (
          <li key={step.title} className="card import-step">
            <span className="import-number" aria-hidden="true">
              {index + 1}
            </span>
            <span className="import-icon">{step.icon}</span>
            <h3 className="import-title">{step.title}</h3>
            <p className="import-body">{step.body}</p>
          </li>
        ))}
      </ol>
      <p className="tip">אפשר גם ״ייבוא קבצים״ באותו מסך, ולבחור את הקובץ ישירות.</p>
    </>
  );
}

const DEFAULT_SETTINGS = (profiles: string[]): CartSettings => ({ preset: 'essentials', custom: DEFAULT_CUSTOM, profile: orderProfiles(profiles)[0] ?? 'src', maxMb: 500 });

/** The store: this year's kvius, the shelves, and the cart that becomes one pack. */
function Store({ meta }: { meta: Meta }) {
  const shelfLoad = useLoad<WorksShelf | null>((signal) => (meta.works ? api.works(signal).catch(() => null) : Promise.resolve(null)), [meta.works]);
  const shelf = shelfLoad.state === 'ready' ? shelfLoad.value : null;
  const today = useMemo(() => new Date(), []);
  const kvius = useMemo(() => kviusOf(today, meta.years), [today, meta.years]);
  const months = useMemo(() => currentMonths(today), [today]);
  const [cart, setCart] = useState<CartItem[]>(() => loadCart().items);
  const [settings, setSettings] = useState<CartSettings>(() => {
    const stored = loadCart().settings;
    const base = DEFAULT_SETTINGS(meta.profiles);
    // A quality the server no longer offers falls back to the recommended one.
    return { ...base, ...stored, profile: stored.profile && meta.profiles.includes(stored.profile) ? stored.profile : base.profile };
  });
  const cartRef = useRef<HTMLDivElement>(null);
  useEffect(() => saveCart(cart, settings), [cart, settings]);

  const add = (item: CartItem) => setCart((current) => addItem(current, item));
  const remove = (item: CartItem) => setCart((current) => removeItem(current, itemKey(item)));

  return (
    <>
      <div className="store">
        <div className="store-main">
          <KviusCard kvius={kvius} months={months} cart={cart} onAdd={add} onRemove={remove} />
          <Shelves meta={meta} shelf={shelf} kvius={kvius} months={months} cart={cart} onAdd={add} onRemove={remove} />
        </div>
        <div className="store-cart" ref={cartRef}>
          <Cart
            meta={meta}
            cart={cart}
            settings={settings}
            onSettings={(patch) => setSettings((current) => ({ ...current, ...patch }))}
            onRemove={(key) => setCart((current) => removeItem(current, key))}
            onClear={() => setCart([])}
          />
        </div>
      </div>
      <CartBar cart={cart} onOpen={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
    </>
  );
}

export function App() {
  const meta = useLoad<Meta>((signal) => api.meta(signal), []);
  const release = useLoad<AppRelease>((signal) => api.appRelease(signal), []);
  const packs = useLoad<PrebuiltPack[]>((signal) => api.packs(signal), []);

  return (
    <div className="page">
      <header className="top">
        <a className="brand" href="/">
          <span className="brand-mark">
            <PackageIcon size={18} />
          </span>
          <span className="brand-name">שיחות קודש</span>
        </a>
        <nav className="top-links">
          <a href={WEB_APP_URL}>לאתר</a>
          <a href="#app">לאפליקציה</a>
          <a href="#cart" className="top-cart" aria-label="לסל">
            <CartIcon size={18} />
          </a>
        </nav>
      </header>

      <main>
        <Hero meta={meta} />

        {meta.state === 'loading' && (
          <div className="card loading">
            <span className="spinner" aria-hidden="true" />
            טוענים את המדפים…
          </div>
        )}
        {meta.state === 'error' && <p className="card error">שרת החבילות אינו זמין כעת ({meta.message}). נסו שוב בעוד רגע.</p>}
        {meta.state === 'ready' && (
          <section className="section section-wide" aria-labelledby="store-title">
            <h2 id="store-title">חבילה לפי בחירה</h2>
            <p className="section-lead">מוסיפים לסל מכל מדף - התוועדויות, הספרייה והספרים - ומורידים הכל כחבילה אחת. הגודל המדויק לפני ההורדה.</p>
            <Store meta={meta.value} />
          </section>
        )}

        {meta.state === 'ready' && packs.state === 'ready' && packs.value.some((p) => p.scope.kind !== 'work') && (
          <section className="section" aria-labelledby="ready-title">
            <h2 id="ready-title">חבילות מוכנות</h2>
            <p className="section-lead">חודש שלם, מוכן להורדה מיידית.</p>
            <ReadyPacks packs={packs.value.filter((p) => p.scope.kind !== 'work')} />
          </section>
        )}

        <section className="section" aria-labelledby="import-title" id="app">
          <h2 id="import-title">איך מכניסים לטלפון</h2>
          <AppDownload release={release} />
          <ImportSteps />
        </section>
      </main>

      <footer className="footer">
        <span className="footer-brand">שיחות קודש</span>
        <span>החבילות חתומות, והאפליקציה בודקת כל קובץ לפני שהוא נכנס.</span>
        <span className="footer-links">
          <a href={appHref(release, 'arm64-v8a')}>האפליקציה לאנדרואיד</a>
          <a href={WEB_APP_URL}>האתר</a>
          {meta.state === 'ready' && <span className="footer-version">{ltr(`catalog ${meta.value.catalogVersion}`)}</span>}
        </span>
      </footer>
    </div>
  );
}
