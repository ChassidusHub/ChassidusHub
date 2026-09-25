import { useEffect, useMemo, useState } from 'react';
import { HDate } from '@hebcal/core';
import type { ReactNode } from 'react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { Meta, PrebuiltPack, SizeResult } from './api';
import { api } from './api';
import type { Choice, CustomSections, Preset } from './selection';
import { DEFAULT_CUSTOM, formatMb, ltr, monthsOf, orderProfiles, profileInfo, selectionQuery, yearLabel } from './selection';
import { CheckIcon, DownloadIcon, FolderIcon, HeadphonesIcon, OnwardIcon, PackageIcon, PhoneIcon, ShieldIcon } from './icons';

/** The app itself: its web version, and the phone app's latest release. */
const WEB_APP_URL = 'https://sichoskodesh.vercel.app';
const PHONE_APP_URL = 'https://github.com/shmuky/Sichos-Kodesh/releases/latest';

const PRESETS: Array<{ value: Preset; label: string; note: string }> = [
  { value: 'essentials', label: 'העיקר', note: 'ההקלטות וההנחות - מה שעמוד ההתוועדות נפתח בו.' },
  { value: 'everything', label: 'הכל', note: 'ההקלטות וההנחות, ועמן המוגה, המאמרים, ההגהות וההוספות.' },
  { value: 'custom', label: 'בחירה', note: 'בוחרים בדיוק מה ייכנס לחבילה.' },
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

/** Years as chips while they fit on a few lines; a long run of years as a list. */
const YEAR_CHIPS_MAX = 12;

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

function Step({ number, title, hint, children }: { number: number; title: string; hint?: string; children: ReactNode }) {
  const id = `step-${number}`;
  return (
    <div className="step" role="group" aria-labelledby={id}>
      <div className="step-head">
        <span className="step-number" aria-hidden="true">
          {number}
        </span>
        <span className="step-title" id={id}>
          {title}
        </span>
      </div>
      {hint && <p className="step-hint">{hint}</p>}
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

function Hero({ meta }: { meta: Load<Meta> }) {
  const flow = [
    { icon: <PackageIcon size={22} />, label: 'בוחרים חבילה' },
    { icon: <DownloadIcon size={22} />, label: 'מורידים אותה' },
    { icon: <PhoneIcon size={22} />, label: 'מעתיקים לטלפון' },
  ];
  return (
    <section className="hero">
      <p className="eyebrow">חבילות להורדה</p>
      <h1 className="hero-title">הכל בטלפון, גם בלי אינטרנט</h1>
      <p className="hero-lead">התוועדויות, הנחות והקלטות בחבילה אחת חתומה. מורידים כאן, מעתיקים לטלפון, והאפליקציה מכניסה הכל בלי חיבור.</p>
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
          <li>שנים: {meta.value.years.map(yearLabel).join(', ')}</li>
          <li>עודכן {new HDate(new Date(meta.value.publishedAt)).renderGematriya(true)}</li>
        </ul>
      )}
    </section>
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

  if (groups.length === 0) return <p className="empty">עדיין אין חבילות מוכנות. אפשר להרכיב חבילה לפי בחירה, כאן למטה.</p>;
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
                <li key={pack.id} className="row">
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

function Builder({ meta }: { meta: Meta }) {
  const profiles = useMemo(() => orderProfiles(meta.profiles), [meta.profiles]);
  const [choice, setChoice] = useState<Choice>(() => ({
    year: meta.years[0]!,
    month: null,
    preset: 'essentials',
    custom: DEFAULT_CUSTOM,
    // The smallest quality the mirror has (Opus plays on the phone from 1.8.0); the originals when that is all there is.
    profile: profiles[0]!,
    maxMb: 200,
  }));
  const year = useLoad<CatalogEntry[]>((signal) => api.catalogYear(choice.year, signal), [choice.year]);
  const months = useMemo(() => (year.state === 'ready' ? monthsOf(year.value) : []), [year]);
  const query = selectionQuery(choice);
  const size = useLoad<SizeResult | null>((signal) => (query ? api.size(query, signal) : Promise.resolve(null)), [query]);
  const update = (patch: Partial<Choice>) => setChoice((current) => ({ ...current, ...patch }));
  const preset = PRESETS.find((p) => p.value === choice.preset)!;

  return (
    <div className="builder">
      <form className="card builder-form" onSubmit={(event) => event.preventDefault()}>
        <Step number={1} title="שנה">
          {meta.years.length <= YEAR_CHIPS_MAX ? (
            <div className="chips" role="radiogroup" aria-label="שנה">
              {meta.years.map((y) => (
                <label key={y} className={choice.year === y ? 'chip chip-on' : 'chip'}>
                  <input type="radio" className="visually-hidden" name="year" id={`year-${y}`} checked={choice.year === y} onChange={() => update({ year: y, month: null })} />
                  {yearLabel(y)}
                </label>
              ))}
            </div>
          ) : (
            <select id="year" className="select" value={choice.year} onChange={(event) => update({ year: Number(event.target.value), month: null })}>
              {meta.years.map((y) => (
                <option key={y} value={y}>
                  {yearLabel(y)}
                </option>
              ))}
            </select>
          )}
        </Step>

        <Step number={2} title="חודש" hint="המספר ליד כל חודש: כמה התוועדויות היו בו.">
          <div className="chips" role="radiogroup" aria-label="חודש">
            <label className={choice.month === null ? 'chip chip-on' : 'chip'}>
              <input type="radio" className="visually-hidden" name="month" id="month-all" checked={choice.month === null} onChange={() => update({ month: null })} />
              כל השנה
            </label>
            {months.map((month) => (
              <label key={month.token} className={choice.month === month.token ? 'chip chip-on' : 'chip'}>
                <input type="radio" className="visually-hidden" name="month" id={`month-${month.token}`} checked={choice.month === month.token} onChange={() => update({ month: month.token })} />
                {month.name}
                <span className="chip-count">{month.occasions}</span>
              </label>
            ))}
          </div>
          {year.state === 'loading' && <p className="step-hint">טוען את חודשי השנה…</p>}
        </Step>

        <Step number={3} title="תוכן">
          <Segmented name="preset" value={choice.preset} options={PRESETS.map(({ value, label }) => ({ value, label }))} onChange={(value) => update({ preset: value })} />
          <p className="step-hint">{preset.note}</p>
          {choice.preset === 'custom' && (
            <div className="chips">
              {CUSTOM_LABELS.map(([key, label]) => (
                <label key={key} className={choice.custom[key] ? 'chip chip-check chip-on' : 'chip chip-check'}>
                  <input type="checkbox" className="visually-hidden" id={`section-${key}`} checked={choice.custom[key]} onChange={(event) => update({ custom: { ...choice.custom, [key]: event.target.checked } })} />
                  <span className="chip-tick" aria-hidden="true">
                    <CheckIcon size={14} />
                  </span>
                  {label}
                </label>
              ))}
            </div>
          )}
        </Step>

        <Step number={4} title="איכות השמע">
          <div className="options" role="radiogroup" aria-label="איכות השמע">
            {profiles.map((profile, index) => {
              const info = profileInfo(profile);
              const on = choice.profile === profile;
              return (
                <label key={profile} className={on ? 'option option-on' : 'option'}>
                  <input type="radio" className="visually-hidden" name="profile" id={`profile-${profile}`} checked={on} onChange={() => update({ profile })} />
                  <span className="option-icon" aria-hidden="true">
                    <HeadphonesIcon size={18} />
                  </span>
                  <span className="option-text">
                    <span className="option-name">
                      {info.name}
                      {index === 0 && profiles.length > 1 && <span className="badge">מומלץ</span>}
                    </span>
                    <span className="option-note">{info.note}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </Step>

        <Step number={5} title="גודל קובץ מרבי" hint="חבילה גדולה יותר מתחלקת לכמה קבצים, כל אחד בגודל הזה לכל היותר.">
          <Segmented name="max" value={choice.maxMb} options={PART_SIZES.map((mb) => ({ value: mb, label: partSizeLabel(mb) }))} onChange={(value) => update({ maxMb: value })} />
        </Step>
      </form>

      <aside className="card result" aria-live="polite">
        <p className="eyebrow">החבילה שלכם</p>
        {!query && <p className="result-empty">בחרו לפחות סוג תוכן אחד.</p>}
        {query && size.state === 'loading' && (
          <div className="result-loading">
            <span className="spinner" aria-hidden="true" />
            מחשבים את הגודל…
          </div>
        )}
        {query && size.state === 'error' && <p className="error">{size.message}</p>}
        {size.state === 'ready' && size.value && (
          <>
            <div className="result-head">
              <h3 className="result-title">{size.value.scope.label.he}</h3>
              <p className="result-size">{ltr(formatMb(size.value.bytes))}</p>
              <p className="result-counts">
                {counted(size.value.occasions, 'התוועדות אחת', 'התוועדויות')} · {counted(size.value.objects, 'קובץ אחד', 'קבצים')}
              </p>
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
                      {counted(part.occasions, 'התוועדות אחת', 'התוועדויות')} · {ltr(formatMb(part.bytes))}
                    </span>
                  </div>
                  <DownloadButton href={api.buildUrl(query!, part.index + 1)} file={part.file} />
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
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

export function App() {
  const meta = useLoad<Meta>((signal) => api.meta(signal), []);
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
          <a href={PHONE_APP_URL}>לאפליקציה</a>
        </nav>
      </header>

      <main>
        <Hero meta={meta} />

        {meta.state === 'loading' && (
          <div className="card loading">
            <span className="spinner" aria-hidden="true" />
            טוענים את החבילות…
          </div>
        )}
        {meta.state === 'error' && <p className="card error">שרת החבילות אינו זמין כעת ({meta.message}). נסו שוב בעוד רגע.</p>}
        {meta.state === 'ready' && (
          <>
            <section className="section" aria-labelledby="ready-title">
              <h2 id="ready-title">חבילות מוכנות</h2>
              <p className="section-lead">חודש שלם, מוכן להורדה מיידית.</p>
              {packs.state === 'ready' ? <ReadyPacks packs={packs.value} /> : <p className="empty">טוען…</p>}
            </section>
            <section className="section" aria-labelledby="builder-title">
              <h2 id="builder-title">חבילה לפי בחירה</h2>
              <p className="section-lead">שנה או חודש, התוכן שרוצים והאיכות - והגודל המדויק לפני ההורדה.</p>
              <Builder meta={meta.value} />
            </section>
          </>
        )}

        <section className="section" aria-labelledby="import-title">
          <h2 id="import-title">איך מכניסים לטלפון</h2>
          <ImportSteps />
        </section>
      </main>

      <footer className="footer">
        <span className="footer-brand">שיחות קודש</span>
        <span>החבילות חתומות, והאפליקציה בודקת כל קובץ לפני שהוא נכנס.</span>
        <span className="footer-links">
          <a href={PHONE_APP_URL}>האפליקציה לאנדרואיד</a>
          <a href={WEB_APP_URL}>האתר</a>
          {meta.state === 'ready' && <span className="footer-version">{ltr(`catalog ${meta.value.catalogVersion}`)}</span>}
        </span>
      </footer>
    </div>
  );
}
