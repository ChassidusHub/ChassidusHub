import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Mails, MessageSquareText, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { LibraryCollectionId } from '@chassidushub-reader/catalog';
import type { LibraryShelfEntry } from '@chassidushub-reader/app-core';
import { authorShelf, libraryShelf, libraryShelfKey, names, scanCount } from '@chassidushub-reader/app-core';
import { useLibrary, useShelf, useWorks } from '../../catalog/catalogStore';
import { COLLECTION_ICONS } from '../../components/collectionIcons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { isRtlLanguage, useTranslation } from '../../i18n/useLanguage';
import { libraryCollectionPath, rebbePath, seferPath } from '../../routes/links';
import { LibraryLoading } from './LibraryLoading';

/** What was written and recorded around the Rebbe's Torah: on the shelf after it, under a heading of its own. */
const AROUND: ReadonlySet<LibraryCollectionId> = new Set(['yomanim', 'jemEvents']);

/** The Rebbe's own seforim with a place of their own on the shelf. */
const WORK_ICONS: Readonly<Record<string, LucideIcon>> = { 'igros-kodesh-rebbe': Mails, maanos: MessageSquareText };
const WORK_BLURBS: Readonly<Record<string, 'igros' | 'maanos'>> = { 'igros-kodesh-rebbe': 'igros', maanos: 'maanos' };

interface ShelfRowProps {
  to: string;
  icon: LucideIcon;
  name: string;
  blurb?: string;
  count?: number;
}

/** One place on the shelf: its icon, its name and what it holds in a few words, and how many. */
function ShelfRow({ to, icon: Icon, name, blurb, count }: ShelfRowProps) {
  const { language } = useTranslation();
  const Chevron = isRtlLanguage(language) ? ChevronLeft : ChevronRight;
  return (
    <li>
      <Link className="shelf-row" to={to}>
        <span className="shelf-row-well">
          <Icon size={20} aria-hidden />
        </span>
        <span className="shelf-row-text">
          <span className="shelf-row-name">{name}</span>
          {blurb && <span className="shelf-row-blurb">{blurb}</span>}
        </span>
        {count !== undefined && <span className="shelf-row-count">{count}</span>}
        <Chevron size={18} className="shelf-row-chevron" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * The library (docs: the UI/UX redo plan, "הספרייה") as one shelf, in the
 * order pack.sk uses (app-core's `libraryShelf`): the Rebbe's Torah first -
 * Likkutei Sichos, the maamorim, Igros Kodesh, the michtavim, reshimos and
 * hadranim - then the yomanim and JEM's recordings around it, then the
 * seforim of the Rebbeim, by Rebbe. Each place opens its own page, and
 * the box above it searches all of them at once.
 */
export function LibraryScreen() {
  const library = useLibrary();
  const works = useWorks();
  const scans = useShelf();
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const shelf = libraryShelf(library, works);
  const torah = shelf.filter((entry) => entry.kind === 'work' || (entry.kind === 'collection' && !AROUND.has(entry.collection)));
  const around = shelf.filter((entry) => entry.kind === 'collection' && AROUND.has(entry.collection));
  const seforim = shelf.find((entry): entry is Extract<LibraryShelfEntry, { kind: 'seforim' }> => entry.kind === 'seforim');
  // Every Rebbe with seforim here, or with books on HebrewBooks alone, in the registry's order; then the seforim of many hands.
  const rebbeim = works
    ? [...works.authors.map((author) => author.id), null]
        .map((authorId) => ({ authorId, author: works.authors.find((a) => a.id === authorId) ?? null, count: seforim?.sections.find((s) => (s.author?.id ?? null) === authorId)?.works.length ?? 0 }))
        .filter(({ authorId, count }) => count > 0 || scanCount(authorShelf(scans, authorId)) > 0)
    : [];

  const row = (entry: LibraryShelfEntry) => {
    if (entry.kind === 'collection') {
      const { collection } = entry;
      return <ShelfRow key={libraryShelfKey(entry)} to={libraryCollectionPath(collection)} icon={COLLECTION_ICONS[collection]} name={t.collectionNames[collection]} blurb={t.homeBlurbs[collection]} count={entry.count} />;
    }
    if (entry.kind === 'work') {
      const { work } = entry;
      const blurb = WORK_BLURBS[work.id];
      return <ShelfRow key={libraryShelfKey(entry)} to={seferPath(work.id)} icon={WORK_ICONS[work.id] ?? Mails} name={names(work.title, language)} blurb={blurb ? t.homeBlurbs[blurb] : undefined} />;
    }
    return null;
  };

  // The library's own search: every part of it, and none of the farbrengens (SearchScreen's `in=library`).
  const search = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({ in: 'library' });
    if (query.trim()) params.set('q', query.trim());
    navigate(`/search?${params.toString()}`);
  };

  return (
    <div className="screen">
      <ScreenHeader title={t.tabNames.library} />
      <form role="search" onSubmit={search} className="shelf-search">
        <input
          className="search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.searchLibraryEverythingPlaceholder}
          aria-label={t.searchLibraryEverythingPlaceholder}
          dir={query ? 'auto' : undefined}
          enterKeyHint="search"
        />
      </form>
      {!library && !works && <LibraryLoading />}

      {torah.length > 0 && (
        <section className="shelf-section" aria-labelledby="shelf-torah">
          <h2 className="category-header" id="shelf-torah">
            {t.libraryShelfTorah}
          </h2>
          <ul className="shelf-list">{torah.map(row)}</ul>
        </section>
      )}

      {around.length > 0 && (
        <section className="shelf-section" aria-labelledby="shelf-around">
          <h2 className="category-header" id="shelf-around">
            {t.libraryShelfAround}
          </h2>
          <ul className="shelf-list">{around.map(row)}</ul>
        </section>
      )}

      {rebbeim.length > 0 && (
        <section className="shelf-section" aria-labelledby="shelf-seforim">
          <h2 className="category-header" id="shelf-seforim">
            {t.seforimRow}
          </h2>
          <ul className="shelf-list">
            {rebbeim.map(({ authorId, author, count }) => (
              <ShelfRow key={authorId ?? 'others'} to={rebbePath(authorId)} icon={UserRound} name={author ? names(author.name, language) : t.seforimOtherAuthors} count={count > 0 ? count : undefined} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
