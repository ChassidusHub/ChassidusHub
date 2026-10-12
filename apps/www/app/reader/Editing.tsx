import { EditFields, Linked, Names } from '../edit/Edit';
import type { ReaderData } from './types';

export { EditBar } from '../edit/Edit';

/**
 * A sicha's own fields in Edit, and Edit's bar: their own file, read only
 * when a page is edited (Reader.tsx), so reading a sicha does not download
 * Edit (#277).
 */
export function SichaFields({ data }: { data: ReaderData }) {
  return (
    <EditFields>
      <Names item={data.id} rev={data.rev} names={data.names} />
      {data.work && (
        <Linked to={`${data.work.path}?edit`} action="לערוך שם">
          נמצא בספר: {data.sub || data.work.label}
        </Linked>
      )}
      <Linked action="בקרוב">הקלטה: לא מקושרת</Linked>
    </EditFields>
  );
}
