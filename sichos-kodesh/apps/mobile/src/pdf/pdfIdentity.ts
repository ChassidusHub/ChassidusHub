import type { RootStackParamList } from '../navigation/types';

export interface PdfIdentity {
  hebrewYear: number;
  occasionId: number;
  driveFileId: string;
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

export function pdfIdentityFromRoute(
  params: RootStackParamList['PdfViewer'],
): PdfIdentity | null {
  const hebrewYear = asPositiveInteger(params.hebrewYear);
  const occasionId = asPositiveInteger(params.occasionId);
  const driveFileId =
    typeof params.driveFileId === 'string' ? params.driveFileId.trim() : '';
  if (!hebrewYear || !occasionId || !driveFileId) return null;
  return { hebrewYear, occasionId, driveFileId };
}

/**
 * Stable per-PDF key for mobile reading progress. Uses the occasion identity
 * plus Drive file id, never a transient route/list index.
 */
export function createPdfProgressKey(identity: PdfIdentity | null): string | null {
  if (!identity) return null;
  return `pdf:${identity.hebrewYear}:${identity.occasionId}:${identity.driveFileId}`;
}

export function resolveInitialPdfPage(
  page: unknown,
  totalPages?: number | null,
): number {
  const fallbackPage =
    typeof page === 'number' && Number.isFinite(page) && page > 0
      ? Math.floor(page)
      : 1;
  const safeTotal =
    typeof totalPages === 'number' && Number.isFinite(totalPages) && totalPages > 0
      ? Math.floor(totalPages)
      : null;
  return safeTotal ? Math.min(fallbackPage, safeTotal) : fallbackPage;
}
