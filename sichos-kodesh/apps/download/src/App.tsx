import { useEffect, useMemo, useState } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { Meta, PrebuiltPack, SizeResult } from './api';
import { api } from './api';
import type { Choice, CustomSections, Preset } from './selection';
import { DEFAULT_CUSTOM, PROFILE_LABELS, formatMb, ltr, monthsOf, selectionQuery, yearLabel } from './selection';

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

function Prebuilt({ packs }: { packs: PrebuiltPack[] }) {
  if (packs.length === 0) return <p className="muted">עדיין אין חבילות מוכנות. אפשר להרכיב חבילה בחלק הבא.</p>;
  return (
    <ul className="packs">
      {packs.map((pack) => (
        <li key={pack.id}>
          <div>
            <strong>{pack.scope.label.he}</strong>
            {pack.part && pack.part.count > 1 && <span className="muted"> · חלק {pack.part.index + 1} מתוך {pack.part.count}</span>}
            <div className="muted">
              {PROFILE_LABELS[pack.profile] ?? pack.profile} · {ltr(formatMb(pack.bytes))}
            </div>
          </div>
          <a className="button" href={api.packUrl(pack.file)} download>
            הורדה
          </a>
        </li>
      ))}
    </ul>
  );
}

function Builder({ meta }: { meta: Meta }) {
  const [choice, setChoice] = useState<Choice>(() => ({
    year: meta.years[0]!,
    month: null,
    preset: 'essentials',
    custom: DEFAULT_CUSTOM,
    // Opus 16 when the mirror has it: the phone plays it (mobile 1.8.0), at about a quarter of the originals' size.
    profile: meta.profiles.includes('opus16') ? 'opus16' : meta.profiles.includes('src') ? 'src' : meta.profiles[0]!,
    maxMb: 200,
  }));
  const year = useLoad<CatalogEntry[]>((signal) => api.catalogYear(choice.year, signal), [choice.year]);
  const months = useMemo(() => (year.state === 'ready' ? monthsOf(year.value) : []), [year]);
  const query = selectionQuery(choice);
  const size = useLoad<SizeResult | null>((signal) => (query ? api.size(query, signal) : Promise.resolve(null)), [query]);
  const update = (patch: Partial<Choice>) => setChoice((current) => ({ ...current, ...patch }));

  return (
    <form className="builder" onSubmit={(event) => event.preventDefault()}>
      <div className="row">
        <label htmlFor="year">שנה</label>
        <select id="year" value={choice.year} onChange={(event) => update({ year: Number(event.target.value), month: null })}>
          {meta.years.map((y) => (
            <option key={y} value={y}>
              {yearLabel(y)}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label htmlFor="month">חודש</label>
        <select id="month" value={choice.month ?? ''} onChange={(event) => update({ month: event.target.value || null })}>
          <option value="">כל השנה</option>
          {months.map((month) => (
            <option key={month.token} value={month.token}>
              {month.name} ({month.occasions})
            </option>
          ))}
        </select>
      </div>
      <fieldset className="row">
        <legend>תוכן</legend>
        <div className="choices">
          {(
            [
              ['essentials', 'העיקר: הקלטות והנחות'],
              ['everything', 'הכל'],
              ['custom', 'בחירה'],
            ] as Array<[Preset, string]>
          ).map(([value, label]) => (
            <label key={value} className="choice">
              <input type="radio" name="preset" id={`preset-${value}`} checked={choice.preset === value} onChange={() => update({ preset: value })} />
              {label}
            </label>
          ))}
        </div>
        {choice.preset === 'custom' && (
          <div className="choices">
            {CUSTOM_LABELS.map(([key, label]) => (
              <label key={key} className="choice">
                <input type="checkbox" id={`section-${key}`} checked={choice.custom[key]} onChange={(event) => update({ custom: { ...choice.custom, [key]: event.target.checked } })} />
                {label}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div className="row">
        <label htmlFor="profile">איכות השמע</label>
        <select id="profile" value={choice.profile} onChange={(event) => update({ profile: event.target.value })}>
          {meta.profiles.map((profile) => (
            <option key={profile} value={profile}>
              {PROFILE_LABELS[profile] ?? profile}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label htmlFor="max">גודל קובץ מרבי</label>
        <select id="max" value={choice.maxMb} onChange={(event) => update({ maxMb: Number(event.target.value) })}>
          {PART_SIZES.map((mb) => (
            <option key={mb} value={mb}>
              {ltr(mb >= 1000 ? `${mb / 1000} GB` : `${mb} MB`)}
            </option>
          ))}
        </select>
      </div>

      <div className="result" aria-live="polite">
        {!query && <p className="muted">יש לבחור לפחות סוג תוכן אחד.</p>}
        {query && size.state === 'loading' && <p className="muted">מחשב…</p>}
        {query && size.state === 'error' && <p className="error">{size.message}</p>}
        {size.state === 'ready' && size.value && (
          <>
            <p className="summary">
              <strong>{size.value.scope.label.he}</strong> · {size.value.occasions} אירועים · {size.value.objects} קבצים · <strong>{ltr(formatMb(size.value.bytes))}</strong>
            </p>
            {size.value.missing > 0 && <p className="muted">{size.value.missing} קבצים עדיין אינם בארכיון, והם לא ייכללו.</p>}
            {!size.value.signed && <p className="error">שרת זה אינו חותם על חבילות: האפליקציה תקבל את הקבצים אחד-אחד.</p>}
            <ul className="packs">
              {size.value.parts.map((part) => (
                <li key={part.index}>
                  <div>
                    <strong>{size.value && size.value.parts.length > 1 ? `חלק ${part.index + 1} מתוך ${size.value.parts.length}` : 'חבילה אחת'}</strong>
                    <div className="muted">
                      {part.occasions} אירועים · {ltr(formatMb(part.bytes))}
                    </div>
                  </div>
                  <a className="button" href={api.buildUrl(query!, part.index + 1)} download={part.file}>
                    הורדה
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </form>
  );
}

export function App() {
  const meta = useLoad<Meta>((signal) => api.meta(signal), []);
  const packs = useLoad<PrebuiltPack[]>((signal) => api.packs(signal), []);

  return (
    <main>
      <header>
        <h1>שיחות קודש · הורדה לטלפון</h1>
        <p className="lead">התוועדויות, הנחות והקלטות כחבילה אחת חתומה. מעתיקים אותה לטלפון, והאפליקציה מכניסה אותה בלי אינטרנט.</p>
      </header>

      {meta.state === 'loading' && <p className="muted">טוען…</p>}
      {meta.state === 'error' && <p className="error">שרת החבילות אינו זמין כעת ({meta.message}).</p>}
      {meta.state === 'ready' && (
        <>
          <section>
            <h2>חבילות מוכנות</h2>
            {packs.state === 'ready' ? <Prebuilt packs={packs.value} /> : <p className="muted">טוען…</p>}
          </section>
          <section>
            <h2>חבילה לפי בחירה</h2>
            <Builder meta={meta.value} />
          </section>
        </>
      )}

      <section>
        <h2>איך מכניסים לטלפון</h2>
        <ol className="steps">
          <li>באפליקציה: הגדרות ← חבילות לא מקוונות ← בוחרים תיקייה (מומלץ Documents/SichosKodesh).</li>
          <li>מעתיקים את קובץ ה-‎.skpack לתיקיית import שבתוכה (בכבל, מכרטיס זיכרון, או מכל מקום אחר).</li>
          <li>פותחים את האפליקציה: החבילה נכנסת מעצמה, כל קובץ נבדק, ומה שכבר יש בטלפון מדולג.</li>
        </ol>
        <p className="muted">אפשר גם ״ייבוא קבצים״ באותו מסך ולבחור את הקובץ ישירות.</p>
      </section>
    </main>
  );
}
