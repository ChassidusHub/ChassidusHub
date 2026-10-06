import { WORKS, type Work } from '@sichos-kodesh/works';

/** The works the registry attaches Sefaria copies to, in the registry's order. */
export function sefariaWorks(): Work[] {
  return WORKS.filter((work) => work.sources.some((source) => source.source === 'sefaria'));
}
