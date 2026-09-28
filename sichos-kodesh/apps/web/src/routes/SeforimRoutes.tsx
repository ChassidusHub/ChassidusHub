import { Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from '../i18n/useLanguage';
import { HebrewBooksShelfScreen } from '../screens/seforim/HebrewBooksShelfScreen';
import { ReaderScreen } from '../screens/seforim/ReaderScreen';
import { RebbeScreen } from '../screens/seforim/RebbeScreen';
import { WorkScreen } from '../screens/seforim/WorkScreen';
import { seferPathIndexes } from './links';

function NotFound() {
  const { t } = useTranslation();
  return <p className="gap-message">{t.pageNotFound}</p>;
}

/** A sefer, opened on the part of its contents the rest of the address counts to (`/s/likkutei-torah/2/1`). */
function WorkRoute() {
  const { workId, '*': rest } = useParams<{ workId: string; '*': string }>();
  const path = seferPathIndexes((rest ?? '').split('/'));
  return path ? <WorkScreen key={workId} workId={workId ?? ''} path={path} /> : <NotFound />;
}

function ReaderRoute() {
  const { workId } = useParams<{ workId: string }>();
  return <ReaderScreen key={workId} workId={workId ?? ''} />;
}

function RebbeRoute() {
  const { authorId } = useParams<{ authorId: string }>();
  return <RebbeScreen key={authorId} authorId={!authorId || authorId === 'others' ? null : authorId} />;
}

function ScansRoute() {
  const { authorId } = useParams<{ authorId: string }>();
  const [params] = useSearchParams();
  const series = params.get('series');
  const author = !authorId || authorId === 'others' ? null : authorId;
  return <HebrewBooksShelfScreen key={`${authorId}/${series ?? ''}`} authorId={author} series={series !== null && /^\d+$/.test(series) ? Number(series) : undefined} />;
}

/** `/s/...`: one Rebbe's seforim, a sefer and the parts of its contents, the reader, and a Rebbe's books on HebrewBooks. */
export function SeforimRoutes() {
  return (
    <Routes>
      <Route path="by/:authorId" element={<RebbeRoute />} />
      <Route path="hebrewbooks/:authorId" element={<ScansRoute />} />
      <Route path=":workId/read" element={<ReaderRoute />} />
      <Route path=":workId/*" element={<WorkRoute />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
