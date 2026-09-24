import { Route, Routes, useParams } from 'react-router-dom';
import type { LibraryCollectionId } from '@sichos-kodesh/catalog';
import { LIBRARY_COLLECTION_IDS } from '@sichos-kodesh/catalog';
import { useTranslation } from '../i18n/useLanguage';
import { LibraryCollectionScreen } from '../screens/library/LibraryCollectionScreen';
import { LibraryGroupScreen } from '../screens/library/LibraryGroupScreen';
import { LibraryItemScreen } from '../screens/library/LibraryItemScreen';
import { LibraryLoading } from '../screens/library/LibraryLoading';
import { LibraryScreen } from '../screens/library/LibraryScreen';
import { OccasionGroupScreen } from '../screens/library/OccasionGroupScreen';
import { OccasionGroupsScreen } from '../screens/library/OccasionGroupsScreen';
import { PdfViewerScreen } from '../screens/PdfViewerScreen';
import { RecordingsScreen } from '../screens/RecordingsScreen';
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

function OccasionGroupRoute({ axis }: { axis: 'moadim' | 'parshiyos' }) {
  const { slug } = useParams<{ slug: string }>();
  return slug ? <OccasionGroupScreen axis={axis} slug={slug} /> : <NotFound />;
}

function ItemRoute({ view }: { view: 'item' | 'recordings' | 'pdf' }) {
  const route = useLibraryItem();
  const { driveFileId } = useParams<{ driveFileId: string }>();
  if (route === undefined)
    return (
      <div className="screen">
        <LibraryLoading />
      </div>
    );
  if (route === null) return <NotFound />;
  if (view === 'recordings') return <RecordingsScreen resolved={route.resolved} />;
  if (view === 'pdf') return <PdfViewerScreen key={driveFileId} resolved={route.resolved} />;
  return <LibraryItemScreen route={route} />;
}

/** Everything under /library: the library, its collections, their groups and items, and the farbrengens by moed and parsha. */
export function LibraryRoutes() {
  return (
    <Routes>
      <Route index element={<LibraryScreen />} />
      <Route path="moadim" element={<OccasionGroupsScreen axis="moadim" />} />
      <Route path="moadim/:slug" element={<OccasionGroupRoute axis="moadim" />} />
      <Route path="parshiyos" element={<OccasionGroupsScreen axis="parshiyos" />} />
      <Route path="parshiyos/:slug" element={<OccasionGroupRoute axis="parshiyos" />} />
      <Route path="c/:collection" element={<CollectionRoute />} />
      <Route path="c/:collection/:axis/:slug" element={<GroupRoute />} />
      <Route path="item/:collection/:id" element={<ItemRoute view="item" />} />
      <Route path="item/:collection/:id/recordings" element={<ItemRoute view="recordings" />} />
      <Route path="item/:collection/:id/pdf/:driveFileId" element={<ItemRoute view="pdf" />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
