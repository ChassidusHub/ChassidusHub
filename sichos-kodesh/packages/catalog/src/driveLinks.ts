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
