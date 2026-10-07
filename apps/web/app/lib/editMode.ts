/**
 * Every page has two modes, Read and Edit, at the same address: Edit is the
 * page with `?edit` (docs/plans/redesign.md). A link that says "please fix
 * this" opens straight into Edit, and leaving Edit keeps everything else in
 * the address (the language, a part, a tab) as it was.
 */

/** Whether an address's query asks for Edit: `?edit`, `?edit=1`; `?edit=0` is Read. */
export function isEditing(search: string | URLSearchParams): boolean {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const value = params.get('edit');
  return value !== null && value !== '0' && value !== 'false';
}

/** The same page in the other mode: `edit` added or taken away, the rest of the query kept in its order. */
export function modeHref(pathname: string, search: string, edit: boolean, hash = ''): string {
  const params = new URLSearchParams(search);
  params.delete('edit');
  // `edit` stays a bare word in the address (`?edit`, not `?edit=`), as people write it.
  const rest = params.toString();
  const query = edit ? (rest ? `${rest}&edit` : 'edit') : rest;
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}
