import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BookText, ExternalLink, Library } from 'lucide-react';
import type { CatalogWork, LibraryCollectionId } from '@chassidushub-reader/catalog';
import { authorShelf, libraryShelf, names, scanCount, unitsAreLetters, workKind, workScans } from '@chassidushub-reader/app-core';
import { useShelf, useWorks } from '../../catalog/catalogStore';
import { COLLECTION_ICONS } from '../../components/collectionIcons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n/useLanguage';
import { scansPath, seferPath } from '../../routes/links';
import { LibraryLoading } from '../library/LibraryLoading';

interface Props {
  /** `null`: the seforim of many hands. */
  authorId: string | null;
}

/**
 * One Rebbe's seforim (the library's last shelf, by Rebbe): the ones that
 * open here first, then the ones read on other sites, then his books on
 * HebrewBooks - the external links stay with him, never a shelf of their
 * own (docs: the UI/UX redo plan, "Structure").
 */
export function RebbeScreen({ authorId }: Props) {
  const works = useWorks();
  const shelf = useShelf();
  const { t, language } = useTranslation();
  const author = works?.authors.find((a) => a.id === authorId) ?? null;
  const seforim = useMemo(() => {
    const entry = libraryShelf(null, works).find((e) => e.kind === 'seforim');
    const section = entry?.kind === 'seforim' ? entry.sections.find((s) => (s.author?.id ?? null) === authorId) : undefined;
    // What opens here before what opens elsewhere, each in the registry's order.
    return [...(section?.works ?? [])].sort((a, b) => Number(workKind(a) === 'links') - Number(workKind(b) === 'links'));
  }, [authorId, works]);
  const scans = scanCount(authorShelf(shelf, authorId));
  const title = author ? names(author.name, language) : t.seforimOtherAuthors;

  const meta = (work: CatalogWork): string => {
    switch (workKind(work)) {
      case 'read':
        return t.seforimChapters(work.units ?? 0, unitsAreLetters(work));
      case 'collection':
        return t.seforimInLibrary;
      case 'links': {
        const count = scanCount(workScans(shelf, work.id));
        return count > 0 ? t.seforimScans(count) : t.seforimLink;
      }
      default:
        return '';
    }
  };

  const iconOf = (work: CatalogWork) => (workKind(work) === 'links' ? ExternalLink : (work.collection && COLLECTION_ICONS[work.collection as LibraryCollectionId]) || BookText);

  return (
    <div className="screen">
      <ScreenHeader to="/library" title={title} />
      {!works && <LibraryLoading />}
      {works && seforim.length === 0 && scans === 0 && (
        <div className="empty-state">
          <p className="empty-state-text">{t.pageNotFound}</p>
        </div>
      )}
      <div className="home-tiles">
        {seforim.map((work) => {
          const Glyph = iconOf(work);
          return (
            <Link key={work.id} className="home-tile" to={seferPath(work.id)}>
              <span className="home-tile-well">
                <Glyph size={20} aria-hidden />
              </span>
              <span className="home-tile-name">{names(work.title, language)}</span>
              <span className="home-tile-blurb">{meta(work)}</span>
            </Link>
          );
        })}
        {scans > 0 && (
          <Link className="home-tile" to={scansPath(authorId)}>
            <span className="home-tile-well">
              <Library size={20} aria-hidden />
            </span>
            <span className="home-tile-name">{authorId ? t.shelfRow : t.shelfOthersRow}</span>
            <span className="home-tile-blurb">{t.shelfBooks(scans)}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
