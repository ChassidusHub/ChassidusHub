import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ALargeSmall, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Copy, Share2 } from 'lucide-react';
import { catalogUnit, type CatalogEdition, type CatalogUnit, type CatalogWork } from '@sichos-kodesh/catalog';
import {
  LINE_HEIGHTS,
  MARGIN_POINTS,
  MEASURE_CHARACTERS,
  TextLoadError,
  chooseEdition,
  citation,
  editionLabel,
  fetchUnitText,
  linkEditions,
  names,
  neighbours,
  parseTextObject,
  pathToUnit,
  readableEditions,
  readerFont,
  readerFontFor,
  readerTextSize,
  unitPart,
  unitPosition,
  unitsAreLetters,
  type TextObject,
  type TextProblem,
} from '@sichos-kodesh/app-core';
import { editionUrl } from '@sichos-kodesh/sefaria-index/reader';
import { useWorkContents, useWorks } from '../../catalog/catalogStore';
import { BackLink } from '../../components/BackLink';
import { ReadingBar } from '../../components/ReadingBar';
import { useReadingChrome } from '../../components/useReadingChrome';
import { useTranslation } from '../../i18n/useLanguage';
import { useOnlineStatus } from '../../network/useOnlineStatus';
import { fontStack, readerPalette } from '../../seforim/readerPalette';
import { isBookmarked, recordPlace, toggleBookmark, useReadingState } from '../../seforim/readingState';
import { EditionPicker } from '../../seforim/EditionPicker';
import { TextObjectView } from '../../seforim/TextObjectView';
import { LibraryLoading } from '../library/LibraryLoading';
import { ReaderSettingsPanel } from './ReaderSettingsPanel';
import { readerPath, seferPath } from '../../routes/links';

type Loaded = { state: 'loading' } | { state: 'ready'; text: TextObject } | { state: 'error'; problem: TextProblem };

/** One chapter on the page: the one opened, those read on into after it, and those read back into before it. */
interface Section {
  unit: CatalogUnit;
  edition: CatalogEdition;
  loaded: Loaded;
}

function problemOf(error: unknown): TextProblem {
  return error instanceof TextLoadError ? error.problem : 'unavailable';
}

function sefariaLink(work: CatalogWork, unit: CatalogUnit, edition: CatalogEdition): string | null {
  const source = work.sources[edition.source];
  if (!source || source.source !== 'sefaria' || !unit.ref) return null;
  return editionUrl({ source: 'sefaria', sourceId: unit.ref, language: source.language, version: source.version });
}

function textLanguage(work: CatalogWork, edition: CatalogEdition): 'he' | 'en' {
  return work.sources[edition.source]?.language === 'en' ? 'en' : 'he';
}

/** Online, from where the edition is served: Sefaria's texts from Sefaria, the Igros from the catalog API (the service worker keeps both once read). */
async function loadText(work: CatalogWork, unit: CatalogUnit, edition: CatalogEdition): Promise<TextObject> {
  if (!navigator.onLine) throw new TextLoadError('offline');
  return parseTextObject(await fetchUnitText(work, unit, edition));
}

/** A selected passage and where to show the share buttons over it. */
interface Selection {
  text: string;
  section: Section;
  top: number;
  left: number;
}

interface Props {
  workId: string;
}

/**
 * A sefer, read the way the reader's settings set it - the same settings
 * and the same place, bookmarks and reading order as the phone's reader:
 * its font, size, spacing and paper; the bar sliding away while reading
 * down; the next chapter following on the same page, and the one before
 * coming in above as the top is neared. The place is kept to
 * the paragraph, and a passage selected can be shared or copied with its
 * source. Texts are read live from Sefaria (the service worker keeps the
 * ones read for offline).
 */
export function ReaderScreen({ workId }: Props) {
  const [params, setParams] = useSearchParams();
  const unitId = params.get('unit') ?? '';
  const asked = params.get('source');
  const askedSource = asked !== null && /^\d+$/.test(asked) ? Number(asked) : undefined;
  const works = useWorks();
  const work = works?.works.find((w) => w.id === workId);
  const contents = useWorkContents(workId, !!work?.units);
  const unit = contents ? catalogUnit(contents, unitId) : undefined;
  const reading = useReadingState();
  // The settings as this sefer is read: the Igros open in their own font until one is chosen.
  const settings = useMemo(() => ({ ...reading.settings, font: readerFontFor(reading.settings, work) }), [reading.settings, work]);
  const online = useOnlineStatus();
  const { t, language } = useTranslation();
  const isRtl = language === 'he';
  const place = reading.places[workId];
  const edition = work && unit ? chooseEdition(work, unit, askedSource, place?.source) : null;

  const [sections, setSections] = useState<Section[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const chrome = useReadingChrome();
  const { settle } = chrome;
  const [panel, setPanel] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [copied, setCopied] = useState(false);
  const nodes = useRef(new Map<string, HTMLElement>());
  const generation = useRef(0);
  const appending = useRef(false);
  const prepending = useRef(false);
  /** The chapter before that could not be had: not asked for again on every scroll. */
  const backFailed = useRef<string | null>(null);
  /** The chapter on screen and where it stood, while a chapter is put above it. */
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const restoreTo = useRef<number | null>(null);
  const here = useRef<{ unitId: string; source: number; offset: number } | null>(null);

  // The chapter opened: loaded afresh when it or its edition changes; anything read on into is dropped.
  useEffect(() => {
    if (!work || !unit || !edition) return;
    const gen = ++generation.current;
    appending.current = false;
    prepending.current = false;
    backFailed.current = null;
    anchor.current = null;
    setCurrentId(null);
    const remembered = place && place.unitId === unit.id && place.source === edition.source ? (place.offset ?? 0) : 0;
    restoreTo.current = remembered > 0 ? remembered : null;
    if (restoreTo.current === null) window.scrollTo(0, 0);
    setSections([{ unit, edition, loaded: { state: 'loading' } }]);
    loadText(work, unit, edition).then(
      (text) => {
        if (gen !== generation.current) return;
        setSections((s) => s.map((x) => (x.unit.id === unit.id ? { ...x, loaded: { state: 'ready', text } } : x)));
        here.current = { unitId: unit.id, source: edition.source, offset: remembered };
        recordPlace(work.id, unit.id, edition.source, remembered);
      },
      (error: unknown) => gen === generation.current && setSections((s) => s.map((x) => (x.unit.id === unit.id ? { ...x, loaded: { state: 'error', problem: problemOf(error) } } : x))),
    );
  }, [work, unit, edition?.source, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // A failed load is tried again once when the connection comes back - not on every failure, which would loop.
  const opened = sections.find((s) => s.unit.id === unit?.id);
  const failed = opened?.loaded.state === 'error';
  useEffect(() => {
    if (online && failed) setAttempt((n) => n + 1);
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reopening a chapter where it was left, once its text is on the page.
  const firstReady = opened?.loaded.state === 'ready';
  useLayoutEffect(() => {
    if (!firstReady || restoreTo.current === null || !unit) return;
    const node = nodes.current.get(unit.id);
    if (node) window.scrollTo({ top: node.offsetTop + restoreTo.current * node.offsetHeight, behavior: 'instant' as ScrollBehavior });
    restoreTo.current = null;
  }, [firstReady, unit]);

  // The place, written when scrolling comes to rest and on the way out (or when the tab is hidden).
  const remember = useCallback(() => {
    if (here.current) recordPlace(workId, here.current.unitId, here.current.source, here.current.offset);
  }, [workId]);
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && remember();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      remember();
    };
  }, [remember]);

  /** The next chapter, loaded onto the end of the page. */
  const readOn = useCallback(() => {
    if (!settings.continuous || appending.current || !work || !contents) return;
    const last = sections[sections.length - 1];
    if (!last || last.loaded.state !== 'ready') return;
    const { next } = neighbours(contents, last.unit.id);
    const nextEdition = next ? chooseEdition(work, next, last.edition.source) : null;
    if (!next || !nextEdition) return;
    const gen = generation.current;
    appending.current = true;
    setSections((s) => [...s, { unit: next, edition: nextEdition, loaded: { state: 'loading' } }]);
    const settle = (loaded: Loaded) => {
      if (gen !== generation.current) return;
      appending.current = false;
      setSections((s) => s.map((x) => (x.unit.id === next.id ? { ...x, loaded } : x)));
    };
    loadText(work, next, nextEdition).then(
      (text) => settle({ state: 'ready', text }),
      (error: unknown) => settle({ state: 'error', problem: problemOf(error) }),
    );
  }, [settings.continuous, work, contents, sections]);

  /** The chapter before, loaded onto the top of the page as the top is neared; the page stays where it was. */
  const readBack = useCallback(() => {
    if (!settings.continuous || prepending.current || restoreTo.current !== null || !work || !contents) return;
    const first = sections[0];
    if (!first || first.loaded.state !== 'ready') return;
    const { previous: before } = neighbours(contents, first.unit.id);
    const beforeEdition = before ? chooseEdition(work, before, first.edition.source) : null;
    if (!before || !beforeEdition || backFailed.current === before.id) return;
    const gen = generation.current;
    prepending.current = true;
    loadText(work, before, beforeEdition).then(
      (text) => {
        if (gen !== generation.current) return;
        prepending.current = false;
        const node = nodes.current.get(first.unit.id);
        anchor.current = node ? { id: first.unit.id, top: node.getBoundingClientRect().top } : null;
        setSections((s) => [{ unit: before, edition: beforeEdition, loaded: { state: 'ready', text } }, ...s]);
      },
      () => {
        if (gen !== generation.current) return;
        prepending.current = false;
        backFailed.current = before.id;
      },
    );
  }, [settings.continuous, work, contents, sections]);

  // A chapter put above the one on screen: the page moves down by its height, so the words on screen stay put.
  useLayoutEffect(() => {
    const held = anchor.current;
    if (!held) return;
    anchor.current = null;
    const node = nodes.current.get(held.id);
    if (!node) return;
    window.scrollBy({ top: node.getBoundingClientRect().top - held.top, behavior: 'instant' as ScrollBehavior });
    settle();
  }, [sections, settle]);

  const retrySection = (index: number) => {
    const section = sections[index];
    if (!work || !section) return;
    if (section.unit.id === unit?.id) {
      setAttempt((n) => n + 1);
      return;
    }
    const gen = generation.current;
    setSections((s) => s.map((x, i) => (i === index ? { ...x, loaded: { state: 'loading' } } : x)));
    loadText(work, section.unit, section.edition).then(
      (text) => gen === generation.current && setSections((s) => s.map((x, i) => (i === index ? { ...x, loaded: { state: 'ready', text } } : x))),
      (error: unknown) => gen === generation.current && setSections((s) => s.map((x, i) => (i === index ? { ...x, loaded: { state: 'error', problem: problemOf(error) } } : x))),
    );
  };

  // Scrolling: the chapter under the upper part of the screen is the one being read, the next chapter comes when the end is near and the one before when the top is. (The bar steps aside on the way down: useReadingChrome.)
  const restTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const height = window.innerHeight;

      const probe = y + height * 0.25;
      let index = 0;
      sections.forEach((section, i) => {
        const node = nodes.current.get(section.unit.id);
        if (node && node.offsetTop <= probe) index = i;
      });
      const section = sections[index];
      const node = section ? nodes.current.get(section.unit.id) : undefined;
      if (section && node) {
        const offset = Math.min(1, Math.max(0, (y - node.offsetTop) / Math.max(1, node.offsetHeight)));
        here.current = { unitId: section.unit.id, source: section.edition.source, offset };
        setCurrentId(section.unit.id);
      }
      if (document.documentElement.scrollHeight - (y + height) < height * 1.5) readOn();
      if (y < height * 1.2) readBack();
      window.clearTimeout(restTimer.current);
      restTimer.current = window.setTimeout(remember, 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // A short chapter leaves room on the screen: the next one comes straight away.
    if (document.documentElement.scrollHeight < window.innerHeight * 1.6) readOn();
    // Opened at its top: the chapter before is put above it straight away, ready to scroll up into.
    if (window.scrollY < window.innerHeight * 1.2) readBack();
    return () => window.removeEventListener('scroll', onScroll);
  }, [sections, readOn, readBack, remember]);

  // The screen stays on while a sefer is open, if asked (Screen Wake Lock, where the browser has it).
  useEffect(() => {
    if (!settings.keepAwake || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (sentinel) => {
          if (alive) lock = sentinel;
          else sentinel.release().catch(() => undefined);
        },
        () => undefined,
      );
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => undefined);
    };
  }, [settings.keepAwake]);

  // A passage selected in the text: its words, the chapter it is in, and a place above it for the buttons.
  useEffect(() => {
    const onSelect = () => {
      const selected = document.getSelection();
      const text = selected?.toString().trim() ?? '';
      if (!selected || !text || selected.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const range = selected.getRangeAt(0);
      const index = sections.findIndex((s) => nodes.current.get(s.unit.id)?.contains(range.commonAncestorContainer));
      if (index < 0) {
        setSelection(null);
        return;
      }
      const box = range.getBoundingClientRect();
      setSelection({ text, section: sections[index]!, top: box.top + window.scrollY, left: box.left + box.width / 2 });
    };
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
  }, [sections]);

  // Arrow keys move between chapters (the reading direction's way: in Hebrew the next chapter is to the left).
  const { previous, next } = contents && unit ? neighbours(contents, unit.id) : { previous: null, next: null };
  const open = useCallback((target: CatalogUnit) => setParams({ unit: target.id, ...(edition ? { source: String(edition.source) } : {}) }), [setParams, edition]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (panel || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      const forward = isRtl ? 'ArrowLeft' : 'ArrowRight';
      const backward = isRtl ? 'ArrowRight' : 'ArrowLeft';
      if (event.key === forward && next) open(next);
      else if (event.key === backward && previous) open(previous);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isRtl, next, previous, open, panel]);

  const style = useMemo(() => {
    const palette = readerPalette(settings.theme);
    return {
      '--r-bg': palette.background,
      '--r-fg': palette.text,
      '--r-muted': palette.muted,
      '--r-accent': palette.accent,
      '--r-rule': palette.rule,
      '--r-font': fontStack(readerFont(settings.font).family),
      '--r-size': `${readerTextSize(settings)}px`,
      '--r-line': String(LINE_HEIGHTS[settings.spacing]),
      '--r-measure': `${MEASURE_CHARACTERS[settings.margins]}ch`,
      '--r-gutter': `${MARGIN_POINTS[settings.margins]}px`,
      '--r-align': settings.justify ? 'justify' : 'start',
    } as CSSProperties;
  }, [settings]);

  if (!works || contents === undefined) {
    return (
      <div className="screen">
        <LibraryLoading />
      </div>
    );
  }

  const back = work && contents && unit ? seferPath(workId, pathToUnit(contents, unit.id)) : '/library';
  if (!work || !unit || !contents) {
    return (
      <div className="screen">
        <BackLink to={back} />
        <div className="empty-state">
          <p className="empty-state-text">{t.readerNotFound}</p>
        </div>
      </div>
    );
  }

  const label = (u: CatalogUnit) => (language === 'en' ? (u.labelEn ?? u.label) : u.label);
  const shown = sections.find((s) => s.unit.id === currentId) ?? opened ?? sections[0];
  const shownUnit = shown?.unit ?? unit;
  const marked = isBookmarked(reading, workId, shownUnit.id);
  const last = sections[sections.length - 1];
  const after = last ? neighbours(contents, last.unit.id).next : null;
  const afterReadable = after ? chooseEdition(work, after, last?.edition.source) !== null : false;
  const Back = isRtl ? ChevronRight : ChevronLeft;
  const On = isRtl ? ChevronLeft : ChevronRight;

  const citationOf = (passage: string, section: Section) => citation(passage, work, section.unit, textLanguage(work, section.edition), sefariaLink(work, section.unit, section.edition));
  const share = (chosen: Selection) => {
    const message = citationOf(chosen.text, chosen.section);
    if (navigator.share) navigator.share({ text: message }).catch(() => undefined);
    else void copy(chosen);
  };
  const copy = async (chosen: Selection) => {
    try {
      await navigator.clipboard.writeText(citationOf(chosen.text, chosen.section));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard (an insecure page, an old browser): the text stays selected to copy by hand.
    }
  };

  return (
    <div className="reader" style={style} data-paper={settings.theme}>
      <ReadingBar back={back} context={names(work.title, language)} title={label(shownUnit)} hidden={chrome.hidden && !panel}>
        <button type="button" className="icon-button" onClick={() => toggleBookmark(workId, shownUnit.id)} aria-label={marked ? t.readerRemoveBookmark : t.readerBookmark} aria-pressed={marked}>
          {marked ? <BookmarkCheck size={22} className="reader-accent" aria-hidden /> : <Bookmark size={22} aria-hidden />}
        </button>
        <button type="button" className="icon-button" onClick={() => setPanel(true)} aria-label={t.readerSettings} aria-haspopup="dialog">
          <ALargeSmall size={24} aria-hidden />
        </button>
      </ReadingBar>

      <main className="reader-page" onClick={chrome.onTap}>
        {/* Read chapter by chapter: the one before is a step away. Read on continuously, it comes in above as the top is neared. */}
        {!settings.continuous && previous && (
          <Link className="reader-next reader-before" to={readerPath(workId, previous.id, edition?.source)}>
            <Back size={20} aria-hidden />
            <span className="reader-next-text">
              <span className="reader-eyebrow">{t.readerPrevious}</span>
              <span className="reader-next-label">{label(previous)}</span>
            </span>
          </Link>
        )}

        {!edition && <p className="tab-help">{t.workNoText}</p>}

        {sections.map((section, index) => {
          const position = unitPosition(contents, section.unit.id);
          // A letter is placed by its volume (its number is its title); a chapter by its place in the sefer.
          const part = unitsAreLetters(work) ? unitPart(contents, section.unit.id) : null;
          const readable = readableEditions(work, section.unit);
          const isOpened = section.unit.id === unit.id;
          const links = isOpened ? linkEditions(work, section.unit) : [];
          const languageCount = (lang: string | undefined) => readable.filter((e) => work.sources[e.source]?.language === lang).length;
          return (
            <section
              key={section.unit.id}
              className="reader-section"
              ref={(node) => {
                if (node) nodes.current.set(section.unit.id, node);
                else nodes.current.delete(section.unit.id);
              }}
            >
              <div className="reader-head">
                {part ? <span className="reader-eyebrow">{names(part, language)}</span> : position && position.total > 1 && <span className="reader-eyebrow">{t.readerChapterOf(position.number, position.total)}</span>}
                <h1 className="reader-heading">{label(section.unit)}</h1>
                {isOpened && (
                  <EditionPicker
                    editions={readable.map((e) => ({ source: e.source, label: editionLabel(work.sources[e.source]!, t.editionLanguages, languageCount(work.sources[e.source]!.language)) }))}
                    current={section.edition.source}
                    links={links.flatMap((e) => {
                      const url = sefariaLink(work, section.unit, e);
                      return url ? [{ source: e.source, label: editionLabel(work.sources[e.source]!, t.editionLanguages, 1), url }] : [];
                    })}
                    onChoose={(source) => setParams({ unit: section.unit.id, source: String(source) })}
                  />
                )}
              </div>

              {section.loaded.state === 'loading' && <LibraryLoading />}
              {section.loaded.state === 'error' && (
                <div className="reader-error">
                  <p className="tab-help">{section.loaded.problem === 'offline' ? t.readerOffline : t.readerUnavailable}</p>
                  <button type="button" className="button" onClick={() => retrySection(index)}>
                    {t.readerRetry}
                  </button>
                </div>
              )}
              {section.loaded.state === 'ready' && (
                <>
                  {isOpened && work.sources[section.edition.source]?.source === 'sefaria' && <p className="reader-from">{t.readerFromSefaria}</p>}
                  <TextObjectView text={section.loaded.text} settings={settings} />
                </>
              )}
            </section>
          );
        })}

        {last?.loaded.state === 'ready' && (
          <div className="reader-end">
            {settings.continuous && after && afterReadable ? (
              <LibraryLoading />
            ) : after ? (
              <Link className="reader-next" to={readerPath(workId, after.id, last.edition.source)}>
                <span className="reader-next-text">
                  <span className="reader-eyebrow">{t.readerNext}</span>
                  <span className="reader-next-label">{label(after)}</span>
                </span>
                <On size={20} aria-hidden />
              </Link>
            ) : (
              <div className="reader-fin">
                <span className="reader-ornament" aria-hidden />
                <span className="reader-eyebrow">{t.readerEndOfSefer}</span>
              </div>
            )}
          </div>
        )}
      </main>

      {selection && (
        <div className="reader-selection" style={{ top: selection.top, left: selection.left }} onMouseDown={(event) => event.preventDefault()}>
          <button type="button" onClick={() => share(selection)} aria-label={t.shareLabel}>
            <Share2 size={16} aria-hidden />
          </button>
          <button type="button" onClick={() => void copy(selection)} aria-label={t.readerCopy}>
            <Copy size={16} aria-hidden />
            {copied && <span className="reader-copied">{t.readerCopied}</span>}
          </button>
        </div>
      )}

      {panel && <ReaderSettingsPanel settings={settings} onClose={() => setPanel(false)} />}
    </div>
  );
}
