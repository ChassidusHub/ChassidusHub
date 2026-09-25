import { Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { HebrewBooksShelfScreen } from '../screens/seforim/HebrewBooksShelfScreen';
import { ReaderScreen } from '../screens/seforim/ReaderScreen';
import { SeforimScreen } from '../screens/seforim/SeforimScreen';
import { WorkScreen } from '../screens/seforim/WorkScreen';

function WorkRoute() {
  const { workId } = useParams<{ workId: string }>();
  return <WorkScreen key={workId} workId={workId ?? ''} />;
}

function ReaderRoute() {
  const { workId } = useParams<{ workId: string }>();
  return <ReaderScreen key={workId} workId={workId ?? ''} />;
}

function ShelfRoute() {
  const { authorId } = useParams<{ authorId: string }>();
  const [params] = useSearchParams();
  const series = params.get('series');
  const author = !authorId || authorId === 'others' ? null : authorId;
  return <HebrewBooksShelfScreen key={`${authorId}/${series ?? ''}`} authorId={author} series={series !== null && /^\d+$/.test(series) ? Number(series) : undefined} />;
}

/** Everything under /seforim: the Rebbeim and their seforim, a sefer's contents, the reader, search by name, and the HebrewBooks shelf. */
export function SeforimRoutes() {
  return (
    <Routes>
      <Route index element={<SeforimScreen />} />
      <Route path="search" element={<Navigate replace to="/search?in=seforim" />} />
      <Route path="hebrewbooks/:authorId" element={<ShelfRoute />} />
      <Route path=":workId" element={<WorkRoute />} />
      <Route path=":workId/read" element={<ReaderRoute />} />
    </Routes>
  );
}
