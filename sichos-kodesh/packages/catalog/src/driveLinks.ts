/**
 * mafteiach-index's mugah/biltiMugah/maamorim/hagahos/hosofos links use
 * two real drive.google.com URL shapes, close to evenly split - verified
 * directly against the database (15,741 PDF-section links): 5,923
 * (38%) as `/file/d/{fileId}/view`, 8,214 (52%) as `open?id={fileId}`
 * (or the equivalent `uc?...&id={fileId}` download-link shape) - an
 * earlier version of this function only handled the first shape, which
 * silently dropped the *majority* of real, publicly-accessible content
 * from the catalog, not a rare variant. The remaining ~10% are other
 * hosts entirely (chabad.org, sie.org, YouTube, ...), correctly excluded.
 */
export function extractDriveFileId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'drive.google.com') return null;

  const pathMatch = /\/file\/d\/([a-zA-Z0-9_-]+)/.exec(parsed.pathname);
  if (pathMatch) return pathMatch[1]!;

  const id = parsed.searchParams.get('id');
  return id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
}

/**
 * A `resourcekey=` query param on a Drive share URL, present on links
 * shared before Google's 2021 resource-key security change - required as
 * the `resourcekey` param on services/media-proxy's `/drive/:fileId` or
 * the file 404s/redirects to a Google sign-in page, even though it's
 * genuinely public. Verified directly: 253 of ~14k real Drive PDF links
 * in the dataset carry one, and a sample otherwise-failing link succeeds
 * once this is forwarded.
 */
export function extractDriveResourceKey(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'drive.google.com') return null;

  const key = parsed.searchParams.get('resourcekey');
  return key && /^[a-zA-Z0-9_-]+$/.test(key) ? key : null;
}

/**
 * A "reshima" (רשימה) is the Rebbe's own private notes/jottings on a
 * sicha or maamar, or a reference to the separately-published "Reshimos"
 * series of his early writings - a different genre from the farbrengen
 * sichos/maamarim this app is scoped to, even though mafteiach-index
 * mixes individual reshima-labeled PDF links into otherwise-legitimate
 * farbrengen occasions (verified against the real crawled dataset: 87 of
 * 18,586 links across 67 occasions, e.g. "רשימת כ"ק אד"ש", "רשימות חוברת
 * יג", "רשימת ההגהות" - editorial notes and a distinct published series,
 * not sicha transcripts). Filters PDF *link labels* only, not occasion
 * labels - the Hebrew root also means the mundane "list" (e.g. a real
 * sicha occasion titled ".. at the time of submitting רשימות [lists] of
 * names.."), which only shows up at the occasion level, not in an
 * individual PDF section link's own label.
 */
const RESHIMOS_LABEL_PATTERN = /רשימ/;

export function isReshimosLabel(label: string): boolean {
  return RESHIMOS_LABEL_PATTERN.test(label);
}
