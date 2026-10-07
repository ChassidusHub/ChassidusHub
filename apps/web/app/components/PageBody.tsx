import { isPageText } from '@chassidushub/model';
import type { Entity } from '../lib/api.js';
import { t, type Lang } from '../lib/i18n.js';
import { PageWords, type DraftWords } from './PageWords.js';

interface BodySource {
  source: string;
  via?: string;
  url?: string;
  copy?: string;
  licence?: string;
  credit?: string;
  importedAt?: string;
}

/**
 * The page's own words, drawn by the display rules of where they came
 * from (PageWords), and, when an importer brought them, the record of
 * where from, with the copy ChassidusHub keeps. In a page's Edit mode
 * (`draft`) each segment can be changed, into the page's draft.
 */
export function PageBody({ entity, lang, draft }: { entity: Pick<Entity, 'id' | 'data'>; lang: Lang; draft?: DraftWords }) {
  const d = entity.data as { body?: unknown; bodySource?: BodySource };
  if (!isPageText(d.body) || !d.body.versions.some((v) => v.segments.length)) return null;
  const s = d.bodySource;
  return (
    <section className="page-body">
      <PageWords page={d.body} lang={lang} edit={draft ? { entityId: entity.id, draft } : undefined} />
      {s ? (
        <p className="body-source row-sub">
          {t(lang, 'importedFrom')} <b>{s.via ?? s.source}</b>
          {s.credit ? ` · ${s.credit}` : ''}
          {s.licence ? ` · ${s.licence}` : ''}
          {s.url ? (
            <>
              {' · '}
              <a href={s.url} target="_blank" rel="noopener">
                {t(lang, 'atTheSource')}
              </a>
            </>
          ) : null}
          {s.copy ? (
            <>
              {' · '}
              <a href={s.copy} target="_blank" rel="noopener">
                {t(lang, 'keptCopy')}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
