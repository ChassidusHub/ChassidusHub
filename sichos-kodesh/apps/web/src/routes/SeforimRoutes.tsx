import { Route, Routes, useParams } from 'react-router-dom';
import { ReaderScreen } from '../screens/seforim/ReaderScreen';
import { SeforimScreen } from '../screens/seforim/SeforimScreen';
import { SeforimSearchScreen } from '../screens/seforim/SeforimSearchScreen';
import { WorkScreen } from '../screens/seforim/WorkScreen';

function WorkRoute() {
  const { workId } = useParams<{ workId: string }>();
  return <WorkScreen key={workId} workId={workId ?? ''} />;
}

function ReaderRoute() {
  const { workId } = useParams<{ workId: string }>();
  return <ReaderScreen key={workId} workId={workId ?? ''} />;
}

/** Everything under /seforim: the Rebbeim and their seforim, a sefer's contents, the reader, and search by name. */
export function SeforimRoutes() {
  return (
    <Routes>
      <Route index element={<SeforimScreen />} />
      <Route path="search" element={<SeforimSearchScreen />} />
      <Route path=":workId" element={<WorkRoute />} />
      <Route path=":workId/read" element={<ReaderRoute />} />
    </Routes>
  );
}
