import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CatalogEntry, LibraryCollection, LibraryItemBase } from '@sichos-kodesh/catalog';
import type { Meta, SizeResult, WorksShelf } from './api';
import { api, isNotArchived } from './api';
import type { CartItem, CartSettings } from './cart';
import { addItem, cartQuery, hasItem, itemHasAudio, itemKey, itemLabel, loadCart, removeItem, saveCart, yearsText } from './cart';
import { useI18n } from './i18n';
import { BookIcon, CalendarIcon, CartIcon, CloseIcon, HeadphonesIcon, LibraryIcon, ShieldIcon } from './icons';
import type { Kvius } from './kvius';
import { currentMonths, kviusOf } from './kvius';
import type { CustomSections, Preset } from './selection';
import { COLLECTION_IDS, DEFAULT_CUSTOM, MONTHS, allOf, axesOf, collectionInfo, countItems, formatMb, groupName, ltr, monthName, monthsOf, orderProfiles, profileInfo, yearLabel } from './selection';
import { SeforimShelf } from './Seforim';
import { AddButton, DownloadButton, Field, Segmented, StepHeader, ToggleChip, toggled, useLoad } from './ui';

/**
 * The store, in three steps: choose what to take (this year's kvius, then
 * the shelves), decide what goes in and how big (the cart's settings, each
 * one line until it is opened), and download (the exact size, and the
 * pack's parts). Every choice the site has is still here; only what the
 * cart needs is asked, one thing at a time.
 */

const PART_SIZES = [100, 200, 500, 1000, 2000];
const PRESETS: Preset[] = ['essentials', 'everything', 'custom'];
const SECTION_KEYS: Array<keyof CustomSections> = ['audio', 'sichosKodesh', 'torasMenachem', 'mugah', 'maamorim', 'hagahos', 'hosofos'];

type Months = { now: string; next: string };

/** Years picked elsewhere (the kvius card's "other months") for the farbrengens shelf to open on. */
interface FarbrengensPreset {
  years: number[];
  nonce: number;
}

/** This year's kvius: its years - all or some - and the farbrengens of this month, next month or the whole year in one tap. */
function KviusCard({ kvius, months, cart, onAdd, onRemove, onOtherMonths }: { kvius: Kvius; months: Months; cart: CartItem[]; onAdd: (item: CartItem) => void; onRemove: (item: CartItem) => void; onOtherMonths: (years: number[]) => void }) {
  const { t, lang } = useI18n();
  const [years, setYears] = useState<number[]>(kvius.years);
  const offers: Array<{ label: string; item: CartItem }> = [
    { label: t.kviusNow(monthName(months.now, lang)), item: { kind: 'farbrengens', years, months: [months.now], kvius: true } },
    { label: t.kviusNext(monthName(months.next, lang)), item: { kind: 'farbrengens', years, months: [months.next], kvius: true } },
    { label: t.kviusWhole, item: { kind: 'farbrengens', years, months: [], kvius: true } },
  ];
  const detail = years.length === 1 ? yearLabel(years[0]!, lang) : t.nYears(years.length);
  return (
    <section className="card kvius" aria-labelledby="kvius-title">
      <div className="kvius-head">
        <span className="kvius-mark" aria-hidden="true">
          <CalendarIcon size={22} />
        </span>
        <div className="kvius-text">
          <p className="eyebrow">{t.kviusEyebrow(yearLabel(kvius.year, lang))}</p>
          <h3 id="kvius-title" className="kvius-title">
            {kvius.years.length > 0 ? t.kviusTitle(kvius.years.map((y) => yearLabel(y, lang)).join(', ')) : t.kviusNone}
          </h3>
          <p className="kvius-lead">{t.kviusLead(kvius.code)}</p>
        </div>
      </div>
      {kvius.years.length > 1 && (
        <Field title={t.kviusWhichYears} hint={t.kviusWhichYearsHint}>
          <div className="chips" role="group" aria-label={t.kviusWhichYears}>
            {kvius.years.map((y) => (
              <ToggleChip
                key={y}
                id={`kvius-year-${y}`}
                on={years.includes(y)}
                mark="kvius"
                onChange={(on) => {
                  const next = toggled(years, y, on).sort((a, b) => a - b);
                  if (next.length > 0) setYears(next);
                }}
              >
                {yearLabel(y, lang)}
              </ToggleChip>
            ))}
          </div>
        </Field>
      )}
      {kvius.years.length > 0 && (
        <div className="kvius-offers">
          {offers.map((offer) => (
            <AddButton key={offer.label} inCart={hasItem(cart, offer.item)} onAdd={() => onAdd(offer.item)} onRemove={() => onRemove(offer.item)} label={offer.label} detail={detail} />
          ))}
          <button type="button" className="text-button kvius-other" onClick={() => onOtherMonths(years)}>
            {t.kviusOther}
          </button>
        </div>
      )}
    </section>
  );
}

/** The farbrengens shelf: years (the kvius years, all of them, or a choice), then months - the same months of every year picked. */
function FarbrengensShelf({ meta, kvius, months: current, preset, cart, onAdd, onRemove }: { meta: Meta; kvius: Kvius; months: Months; preset: FarbrengensPreset | null; cart: CartItem[]; onAdd: (item: CartItem) => void; onRemove: (item: CartItem) => void }) {
  const { t, lang } = useI18n();
  const kviusYears = new Set(kvius.years);
  const latest = meta.years[meta.years.length - 1]!;
  const [years, setYears] = useState<number[]>(() => preset?.years ?? (kvius.years.length > 0 ? [...kvius.years] : [latest]));
  const [months, setMonths] = useState<string[]>([]);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => {
    if (preset) setYears(preset.years);
  }, [preset]);
  const single = years.length === 1 ? years[0]! : null;
  const year = useLoad<CatalogEntry[] | null>((signal) => (single ? api.catalogYear(single, signal) : Promise.resolve(null)), [single]);
  const monthOptions = useMemo(
    () => (single && year.state === 'ready' && year.value ? monthsOf(year.value, lang) : MONTHS.map((m) => ({ token: m.key, name: monthName(m.key, lang), occasions: 0 }))),
    [single, year, lang],
  );
  const sorted = [...years].sort((a, b) => a - b);
  const item: CartItem = { kind: 'farbrengens', years: sorted, months: MONTHS.filter((m) => months.includes(m.key)).map((m) => m.key) };
  const allYears = years.length === meta.years.length;
  const onlyKvius = kvius.years.length > 0 && years.length === kvius.years.length && years.every((y) => kviusYears.has(y));
  const summary = `${item.months.length === 0 ? t.wholeYear : item.months.map((m) => monthName(m, lang)).join(', ')} · ${years.length === 1 ? yearLabel(years[0]!, lang) : t.nYears(years.length)}`;

  return (
    <div className="shelf-body">
      <Field title={t.years} hint={t.yearsHint}>
        <div className="chips" role="group" aria-label={t.years}>
          {kvius.years.length > 0 && (
            <ToggleChip id="years-kvius" on={onlyKvius} mark="kvius" onChange={(on) => on && setYears([...kvius.years])} title={t.kviusYearsTitle(yearLabel(kvius.year, lang))}>
              {t.kviusYears(kvius.years.length)}
            </ToggleChip>
          )}
          <ToggleChip id="years-all" on={allYears} onChange={(on) => setYears(on ? [...meta.years] : [latest])}>
            {t.allYears}
          </ToggleChip>
          <button type="button" className="chip chip-more" aria-expanded={choosing} onClick={() => setChoosing(!choosing)}>
            {choosing ? t.hideYears : t.pickYears}
          </button>
        </div>
        {!choosing && <p className="picked-line">{yearsText(sorted, lang)}</p>}
        {choosing && (
          <>
            <div className="chips chips-years" role="group" aria-label={t.years}>
              {meta.years.map((y) => (
                <ToggleChip
                  key={y}
                  id={`year-${y}`}
                  on={years.includes(y)}
                  mark={kviusYears.has(y) ? 'kvius' : undefined}
                  title={kviusYears.has(y) ? t.kviusYearTitle(yearLabel(kvius.year, lang)) : undefined}
                  onChange={(on) => {
                    const next = toggled(years, y, on);
                    if (next.length > 0) setYears(next);
                  }}
                >
                  {yearLabel(y, lang)}
                </ToggleChip>
              ))}
            </div>
            {kvius.years.length > 0 && (
              <p className="legend">
                <span className="legend-dot legend-kvius" aria-hidden="true" /> {t.kviusLegend}
              </p>
            )}
          </>
        )}
      </Field>

      <Field title={t.months} hint={single ? t.monthsHint : undefined}>
        <div className="chips" role="group" aria-label={t.months}>
          <ToggleChip id="months-all" on={months.length === 0} onChange={() => setMonths([])}>
            {t.wholeYear}
          </ToggleChip>
          {monthOptions.map((month) => (
            <ToggleChip key={month.token} id={`month-${month.token}`} on={months.includes(month.token)} mark={month.token === current.now ? 'now' : undefined} onChange={(on) => setMonths(toggled(months, month.token, on))}>
              {month.name}
              {month.token === current.now && <span className="chip-flag">{t.flagNow}</span>}
              {month.token === current.next && <span className="chip-flag chip-flag-soft">{t.flagNext}</span>}
              {single && <span className="chip-count">{month.occasions}</span>}
            </ToggleChip>
          ))}
        </div>
        {single && year.state === 'loading' && <p className="field-hint">{t.loadingMonths}</p>}
      </Field>

      <div className="shelf-action">
        <AddButton inCart={hasItem(cart, item)} onAdd={() => onAdd(item)} onRemove={() => onRemove(item)} detail={summary} />
      </div>
    </div>
  );
}

/** A library collection, browsed as the app browses it: an axis, then any of its groups - or all of it. */
function LibraryShelf({ meta, cart, onAdd, onRemove }: { meta: Meta; cart: CartItem[]; onAdd: (item: CartItem) => void; onRemove: (item: CartItem) => void }) {
  const { t, lang } = useI18n();
  const offered = COLLECTION_IDS.filter((id) => id !== 'farbrengens' && meta.library?.includes(id));
  const [collection, setCollection] = useState(offered[0] ?? '');
  const data = useLoad<LibraryCollection<LibraryItemBase> | null>((signal) => (collection ? api.library(collection, signal) : Promise.resolve(null)), [collection]);
  const axes = useMemo(() => (data.state === 'ready' && data.value ? axesOf(data.value.groups, lang) : []), [data, lang]);
  const firstAxis = axes[0]?.id ?? null;
  const [axis, setAxis] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  // Each collection opens on its first axis, as the app's browser does.
  useEffect(() => {
    setAxis(firstAxis);
    setPicked([]);
  }, [firstAxis, collection]);

  if (offered.length === 0) return <p className="shelf-empty">{t.libraryEmpty}</p>;
  const info = collectionInfo(collection, lang);
  const groups = data.state === 'ready' && data.value && axis ? (data.value.groups[axis] ?? []) : [];
  const chosen = groups.filter((g) => picked.includes(g.slug));
  const item: CartItem =
    axis && chosen.length > 0 ? { kind: 'library', collection, axis, groups: chosen.map((g) => ({ slug: g.slug, name: g.name, ...(g.nameEn ? { nameEn: g.nameEn } : {}) })) } : { kind: 'library', collection, axis: null, groups: [] };
  const whole = !axis;
  const names = chosen.map((g) => groupName(collection, axis ?? '', g, lang));

  return (
    <div className="shelf-body">
      <div className="subtabs" role="radiogroup" aria-label={t.shelfLibrary}>
        {offered.map((id) => (
          <label key={id} className={collection === id ? 'subtab subtab-on' : 'subtab'}>
            <input type="radio" className="visually-hidden" name="collection" id={`collection-${id}`} checked={collection === id} onChange={() => setCollection(id)} />
            {collectionInfo(id, lang).name}
          </label>
        ))}
      </div>
      {data.state === 'loading' && (
        <div className="loading">
          <span className="spinner" aria-hidden="true" />
          {t.loadingCollection(info.name)}
        </div>
      )}
      {data.state === 'error' && <p className="error">{data.message}</p>}
      {data.state === 'ready' && data.value && (
        <>
          <Field title={t.browseBy} hint={t.browseHint(countItems(info, data.value.items.length, lang))}>
            <div className="chips" role="radiogroup" aria-label={t.browseBy}>
              {[...axes.map((a) => ({ value: a.id, label: a.name })), { value: '', label: allOf(info, lang) }].map((option) => (
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
            <Field title={axes.find((a) => a.id === axis)?.name ?? ''} hint={t.groupsHint(info.many)}>
              <div className="chips chips-scroll" role="group" aria-label={t.groupsLabel}>
                {groups.map((group) => (
                  <ToggleChip key={group.slug} id={`group-${group.slug}`} on={picked.includes(group.slug)} onChange={(on) => setPicked(toggled(picked, group.slug, on))}>
                    {groupName(collection, axis, group, lang)}
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
              detail={whole ? allOf(info, lang) : chosen.length === 0 ? t.pickFirst : `${info.name}: ${names.length <= 3 ? names.join(', ') : t.nGroups(names.length)}`}
            />
          </div>
        </>
      )}
    </div>
  );
}

type ShelfId = 'farbrengens' | 'library' | 'works';

function Shelves({ meta, shelf, kvius, months, preset, cart, onAdd, onRemove, tab, onTab }: { meta: Meta; shelf: WorksShelf | null; kvius: Kvius; months: Months; preset: FarbrengensPreset | null; cart: CartItem[]; onAdd: (item: CartItem) => void; onRemove: (item: CartItem) => void; tab: ShelfId; onTab: (tab: ShelfId) => void }) {
  const { t } = useI18n();
  const tabs: Array<{ id: ShelfId; name: string; icon: ReactNode }> = [
    { id: 'farbrengens', name: t.shelfFarbrengens, icon: <HeadphonesIcon size={18} /> },
    ...((meta.library?.length ?? 0) > 0 ? [{ id: 'library' as const, name: t.shelfLibrary, icon: <LibraryIcon size={18} /> }] : []),
    ...(shelf ? [{ id: 'works' as const, name: t.shelfSeforim, icon: <BookIcon size={18} /> }] : []),
  ];
  return (
    <section className="card shelves" id="shelves" aria-label={t.shelvesLabel}>
      <div className="shelf-tabs" role="tablist" aria-label={t.shelvesLabel}>
        {tabs.map((tb) => (
          <button key={tb.id} type="button" role="tab" id={`tab-${tb.id}`} aria-selected={tab === tb.id} className={tab === tb.id ? 'shelf-tab shelf-tab-on' : 'shelf-tab'} onClick={() => onTab(tb.id)}>
            {tb.icon}
            {tb.name}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'farbrengens' && <FarbrengensShelf meta={meta} kvius={kvius} months={months} preset={preset} cart={cart} onAdd={onAdd} onRemove={onRemove} />}
        {tab === 'library' && <LibraryShelf meta={meta} cart={cart} onAdd={onAdd} onRemove={onRemove} />}
        {tab === 'works' && shelf && <SeforimShelf shelf={shelf} cart={cart} onAdd={onAdd} onRemove={onRemove} />}
      </div>
    </section>
  );
}

/** One cart line's own size, with the cart's settings. */
function LineSize({ query }: { query: string | null }) {
  const { t } = useI18n();
  const size = useLoad<SizeResult | null>((signal) => (query ? api.size(query, signal) : Promise.resolve(null)), [query]);
  if (!query) return null;
  if (size.state === 'loading') return <span className="line-size line-size-wait">…</span>;
  if (size.state === 'error' && !isNotArchived(size.message))
    return (
      <button type="button" className="line-size line-size-retry" onClick={size.retry}>
        {t.retry}
      </button>
    );
  if (size.state === 'error' || !size.value) return <span className="line-size line-size-missing">{t.notArchived}</span>;
  return <span className="line-size">{ltr(formatMb(size.value.bytes))}</span>;
}

/** A setting as one line - its name and what it is - until it is opened to change. */
function SettingRow({ id, title, value, open, onOpen, onClose, children }: { id: string; title: string; value: string; open: boolean; onOpen: () => void; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  if (!open)
    return (
      <div className="setting-row">
        <div className="setting-text">
          <span className="setting-title">{title}</span>
          <span className="setting-value">{value}</span>
        </div>
        <button type="button" className="text-button setting-change" onClick={onOpen} aria-controls={`setting-${id}`}>
          {t.change}
        </button>
      </div>
    );
  return (
    <div className="setting-open" id={`setting-${id}`}>
      {children}
      <button type="button" className="text-button setting-done" onClick={onClose}>
        {t.done}
      </button>
    </div>
  );
}

/** Step 2: what comes from each farbrengen, the audio quality, the largest file - each asked only when the cart needs it. */
function Settings({ meta, cart, settings, onSettings }: { meta: Meta; cart: CartItem[]; settings: CartSettings; onSettings: (patch: Partial<CartSettings>) => void }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const profiles = useMemo(() => orderProfiles(meta.profiles), [meta.profiles]);
  const hasFarbrengens = cart.some((i) => i.kind === 'farbrengens');
  const hasAudio = cart.some(itemHasAudio);
  const preset = t.presets[settings.preset];
  const presetValue = settings.preset === 'custom' ? SECTION_KEYS.filter((k) => settings.custom[k]).map((k) => t.sections[k]).join(', ') || '—' : preset.label;
  const partSize = (mb: number) => ltr(mb >= 1000 ? `${mb / 1000} GB` : `${mb} MB`);

  return (
    <div className="cart-settings">
      {hasFarbrengens && (
        <SettingRow id="preset" title={t.presetTitle} value={presetValue} open={open === 'preset'} onOpen={() => setOpen('preset')} onClose={() => setOpen(null)}>
          <Field title={t.presetTitle}>
            <Segmented name="preset" value={settings.preset} options={PRESETS.map((value) => ({ value, label: t.presets[value].label }))} onChange={(value) => onSettings({ preset: value })} />
            <p className="field-hint">{preset.note}</p>
            {settings.preset === 'custom' && (
              <div className="chips">
                {SECTION_KEYS.map((key) => (
                  <ToggleChip key={key} id={`section-${key}`} on={settings.custom[key]} onChange={(on) => onSettings({ custom: { ...settings.custom, [key]: on } })}>
                    {t.sections[key]}
                  </ToggleChip>
                ))}
              </div>
            )}
          </Field>
        </SettingRow>
      )}
      {hasAudio && profiles.length > 1 && (
        <SettingRow id="profile" title={t.qualityTitle} value={`${profileInfo(settings.profile, lang).name} · ${profileInfo(settings.profile, lang).note}`} open={open === 'profile'} onOpen={() => setOpen('profile')} onClose={() => setOpen(null)}>
          <Field title={t.qualityTitle}>
            <Segmented name="profile" value={settings.profile} options={profiles.map((p) => ({ value: p, label: profileInfo(p, lang).name }))} onChange={(value) => onSettings({ profile: value })} />
            <p className="field-hint">{profileInfo(settings.profile, lang).note}</p>
          </Field>
        </SettingRow>
      )}
      <SettingRow id="max" title={t.maxTitle} value={partSize(settings.maxMb)} open={open === 'max'} onOpen={() => setOpen('max')} onClose={() => setOpen(null)}>
        <Field title={t.maxTitle} hint={t.maxHint}>
          <Segmented name="max" value={settings.maxMb} options={PART_SIZES.map((mb) => ({ value: mb, label: partSize(mb) }))} onChange={(value) => onSettings({ maxMb: value })} />
        </Field>
      </SettingRow>
    </div>
  );
}

/** Step 3: the pack's exact size and its parts, each a whole pack to download now or later. */
function Total({ query }: { query: string | null }) {
  const { t } = useI18n();
  const size = useLoad<SizeResult | null>((signal) => (query ? api.size(query, signal, true) : Promise.resolve(null)), [query]);
  const counts = (items: number, works: number, files?: number) => [items > 0 ? t.items(items) : null, works > 0 ? t.works(works) : null, files !== undefined ? t.files(files) : null].filter(Boolean).join(' · ');
  return (
    <div className="cart-total" aria-live="polite">
      {!query && <p className="error">{t.pickContent}</p>}
      {query && size.state === 'loading' && (
        <div className="result-loading">
          <span className="spinner" aria-hidden="true" />
          {t.sizing}
        </div>
      )}
      {query && size.state === 'error' && (
        <div className="error">
          <p>{isNotArchived(size.message) ? t.sizeNotArchived : t.sizeFailed}</p>
          {!isNotArchived(size.message) && (
            <button type="button" className="text-button" onClick={size.retry}>
              {t.sizeRetry}
            </button>
          )}
        </div>
      )}
      {size.state === 'ready' && size.value && (
        <>
          <div className="result-head">
            <p className="eyebrow">{t.thePack}</p>
            <p className="result-size">{ltr(formatMb(size.value.bytes))}</p>
            <p className="result-counts">{counts(size.value.occasions, size.value.works ?? 0, size.value.objects)}</p>
          </div>
          {size.value.missing > 0 && <p className="note">{t.missing(size.value.missing)}</p>}
          {size.value.signed ? (
            <p className="signed">
              <ShieldIcon size={16} />
              {t.signed}
            </p>
          ) : (
            <p className="error">{t.unsigned}</p>
          )}
          {size.value.parts.length > 1 && <p className="field-hint">{t.partsHint}</p>}
          <ul className="rows">
            {size.value.parts.map((part) => (
              <li key={part.index} className="row">
                <div className="row-text">
                  <span className="row-title">{size.value && size.value.parts.length > 1 ? t.partOf(part.index + 1, size.value.parts.length) : t.onePack}</span>
                  <span className="row-note">
                    {counts(part.occasions, part.works ?? 0)} · {ltr(formatMb(part.bytes))}
                  </span>
                </div>
                <DownloadButton href={api.buildUrl(query!, part.index + 1)} file={part.file} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function CartPanel({ meta, cart, settings, onSettings, onRemove, onClear }: { meta: Meta; cart: CartItem[]; settings: CartSettings; onSettings: (patch: Partial<CartSettings>) => void; onRemove: (key: string) => void; onClear: () => void }) {
  const { t, lang } = useI18n();
  const query = cartQuery(cart, settings);
  return (
    <aside className="card cart" id="cart" aria-labelledby="cart-title">
      <div className="cart-head">
        <CartIcon size={20} />
        <h3 id="cart-title" className="cart-title">
          {t.cart}
        </h3>
        {cart.length > 0 && <span className="cart-count">{cart.length}</span>}
        {cart.length > 0 && (
          <button type="button" className="text-button" onClick={onClear}>
            {t.emptyCart}
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        <p className="cart-empty">{t.cartEmpty}</p>
      ) : (
        <ul className="cart-lines">
          {cart.map((item) => {
            const label = itemLabel(item, lang);
            const key = itemKey(item);
            return (
              <li key={key} className="cart-line">
                <div className="cart-line-text">
                  <span className="cart-line-title">{label.title}</span>
                  <span className="cart-line-detail">{label.detail}</span>
                </div>
                <LineSize query={cartQuery([item], settings)} />
                <button type="button" className="icon-button" onClick={() => onRemove(key)} aria-label={t.removeFromCart(label.title)}>
                  <CloseIcon size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className={cart.length === 0 ? 'cart-step cart-step-waiting' : 'cart-step'}>
        <StepHeader n={2} title={t.step2Title} lead={cart.length === 0 ? t.step2Empty : undefined} />
        {cart.length > 0 && <Settings meta={meta} cart={cart} settings={settings} onSettings={onSettings} />}
      </div>
      <div className={cart.length === 0 ? 'cart-step cart-step-waiting' : 'cart-step'}>
        <StepHeader n={3} title={t.step3Title} />
        {cart.length > 0 && <Total query={query} />}
      </div>
    </aside>
  );
}

/** On a phone the cart sits below the shelves: a bar at the bottom says what is in it and leads there. */
function CartBar({ cart, onOpen }: { cart: CartItem[]; onOpen: () => void }) {
  const { t } = useI18n();
  if (cart.length === 0) return null;
  return (
    <div className="cart-bar">
      <button type="button" className="cart-bar-button" onClick={onOpen}>
        <CartIcon size={18} />
        <span>{t.cartBarItems(cart.length)}</span>
        <span className="cart-bar-go">{t.cartBarGo}</span>
      </button>
    </div>
  );
}

const DEFAULT_SETTINGS = (profiles: string[]): CartSettings => ({ preset: 'essentials', custom: DEFAULT_CUSTOM, profile: orderProfiles(profiles)[0] ?? 'src', maxMb: 500 });

/** The store: step 1 (this year's kvius, the shelves), and the cart with steps 2 and 3. */
export function Store({ meta }: { meta: Meta }) {
  const { t } = useI18n();
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
  const [tab, setTab] = useState<ShelfId>('farbrengens');
  const [preset, setPreset] = useState<FarbrengensPreset | null>(null);
  const cartRef = useRef<HTMLDivElement>(null);
  useEffect(() => saveCart(cart, settings), [cart, settings]);

  const add = (item: CartItem) => setCart((current) => addItem(current, item));
  const remove = (item: CartItem) => setCart((current) => removeItem(current, itemKey(item)));
  // The kvius card's "other months": the farbrengens shelf, on the years picked there.
  const otherMonths = (years: number[]) => {
    setTab('farbrengens');
    setPreset({ years, nonce: Date.now() });
    document.getElementById('shelves')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <div className="store">
        <div className="store-main">
          <StepHeader n={1} title={t.step1Title} lead={t.step1Lead} />
          <KviusCard kvius={kvius} months={months} cart={cart} onAdd={add} onRemove={remove} onOtherMonths={otherMonths} />
          <Shelves meta={meta} shelf={shelf} kvius={kvius} months={months} preset={preset} cart={cart} onAdd={add} onRemove={remove} tab={tab} onTab={setTab} />
        </div>
        <div className="store-cart" ref={cartRef}>
          <CartPanel
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
