/**
 * ~93% of mafteiach-index's mugah/biltiMugah/maamorim/hagahos/hosofos
 * links are plain `drive.google.com/file/d/{fileId}/view` share links
 * (confirmed against the real crawled dataset) - exactly the shape
 * services/media-proxy's `/drive/:fileId` route already handles. This
 * extracts the bare file id so the catalog can reference it directly.
 */
const DRIVE_FILE_ID_PATTERN = /\/file\/d\/([a-zA-Z0-9_-]+)/;

export function extractDriveFileId(url: string): string | null {
  const match = DRIVE_FILE_ID_PATTERN.exec(url);
  return match ? match[1]! : null;
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
