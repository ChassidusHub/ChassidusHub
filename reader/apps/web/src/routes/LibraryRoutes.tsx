import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import type { LibraryCollectionId } from '@chassidushub-reader/catalog';
import { LIBRARY_COLLECTION_IDS, currentParsha } from '@chassidushub-reader/catalog';
import { lsParshaSlugs } from '@chassidushub-reader/app-core';
import { useLibrary } from '../catalog/catalogStore';
import { IL } from '../config';
import { useTranslation } from '../i18n/useLanguage';
import { LibraryCollectionScreen } from '../screens/library/LibraryCollectionScreen';
import { LibraryGroupScreen } from '../screens/library/LibraryGroupScreen';
import { LibraryItemScreen } from '../screens/library/LibraryItemScreen';
import { LibraryLoading } from '../screens/library/LibraryLoading';
import { LibraryScreen } from '../screens/library/LibraryScreen';
import { OccasionGroupScreen } from '../screens/library/OccasionGroupScreen';
import { PdfViewerScreen } from '../screens/PdfViewerScreen';
import { canonicalLibraryPath, libraryCollectionPath, libraryGroupPath } from './links';
import { useLibraryItem } from './useLibraryItem';

function NotFound() {
  const { t } = useTranslation();
  return <p className="gap-message">{t.pageNotFound}</p>;
}

function isCollection(value: string | undefined): value is LibraryCollectionId {
  return !!value && (LIBRARY_COLLECTION_IDS as readonly string[]).includes(value);
}

function CollectionRoute() {
  const { collection } = useParams<{ collection: string }>();
  return isCollection(collection) ? <LibraryCollectionScreen collection={collection} /> : <NotFound />;
}

function GroupRoute() {
  const { collection, axis, slug } = useParams<{ collection: string; axis: string; slug: string }>();
  return isCollection(collection) && axis && slug ? <LibraryGroupScreen collection={collection} axis={axis} slug={slug} /> : <NotFound />;
}

/** The farbrengens of one moed or parsha (`/farbrengens/moed/:slug`, `/farbrengens/parsha/:slug`). */
export function OccasionGroupRoute({ axis }: { axis: 'moadim' | 'parshiyos' }) {
  const { slug } = useParams<{ slug: string }>();
  return slug ? <OccasionGroupScreen axis={axis} slug={slug} /> : <NotFound />;
}

function ItemRoute({ view }: { view: 'item' | 'pdf' }) {
  const route = useLibraryItem();
  const { driveFileId } = useParams<{ driveFileId: string }>();
  if (route === undefined)
    return (
      <div className="screen">
        <LibraryLoading />
      </div>
    );
  if (route === null) return <NotFound />;
  if (view === 'pdf') return <PdfViewerScreen key={driveFileId} resolved={route.resolved} />;
  return <LibraryItemScreen route={route} />;
}

/** This week's parsha in Likkutei Sichos (This week's link): its group once the library is here, else the sichos by parsha. */
function ThisParshaRoute() {
  const library = useLibrary();
  if (!library)
    return (
      <div className="screen">
        <LibraryLoading />
      </div>
    );
  const slug = lsParshaSlugs(library, currentParsha(IL).parsha)[0];
  return <Navigate replace to={slug ? libraryGroupPath('likkuteiSichos', 'parsha', slug) : libraryCollectionPath('likkuteiSichos', 'parsha')} />;
}

/** An address from before the library's own (`/library/c/...`, `/library/item/...`, `/seforim/...`): on to its new one (routes/links.ts). */
export function LegacyLibraryRoute() {
  const { pathname, search } = useLocation();
  const next = canonicalLibraryPath(pathname, search);
  return next ? <Navigate replace to={next} /> : <NotFound />;
}

/** `/library`: the tab's one shelf, and This week's way into the parsha's sichos; every older address under it leads on. */
export function LibraryRoutes() {
  return (
    <Routes>
      <Route index element={<LibraryScreen />} />
      <Route path="this-parsha" element={<ThisParshaRoute />} />
      <Route path="*" element={<LegacyLibraryRoute />} />
    </Routes>
  );
}

/** `/l/...`: a collection of the library, its groups, one item and the item's PDFs. */
export function CollectionRoutes() {
  return (
    <Routes>
      <Route path=":collection" element={<CollectionRoute />} />
      <Route path=":collection/:id" element={<ItemRoute view="item" />} />
      <Route path=":collection/:axis/:slug" element={<GroupRoute />} />
      <Route path=":collection/:id/pdf/:driveFileId" element={<ItemRoute view="pdf" />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
