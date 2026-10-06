import { WORKS, type Work } from '@chassidushub-reader/works';

/** The works the registry attaches Sefaria copies to, in the registry's order. */
export function sefariaWorks(): Work[] {
  return WORKS.filter((work) => work.sources.some((source) => source.source === 'sefaria'));
}
