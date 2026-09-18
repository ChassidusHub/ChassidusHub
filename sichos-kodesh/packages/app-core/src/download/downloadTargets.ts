import type { CatalogEntry, CatalogPdf, PdfEdition, PdfSection } from '@sichos-kodesh/catalog';
import { classifyPdfEdition, isHighlightedFarbrengenHanacha } from '@sichos-kodesh/catalog';

export interface DownloadContentTypes {
  audio: boolean;
  hanachaEditions: PdfEdition[];
  mugah: boolean;
  maamorim: boolean;
  hagahos: boolean;
  hosofos: boolean;
}

export interface DownloadTarget {
  key: string;
  hebrewYear: number;
  occasionId: number;
  label: string;
  kind: 'audio' | 'pdf';
  chapterIndex?: number;
  workerFilename?: string;
  driveFileId?: string;
  resourceKey?: string | null;
  section?: PdfSection;
}

export const ALL_CONTENT_TYPES: DownloadContentTypes = {
  audio: true,
  hanachaEditions: ['sichosKodesh', 'sefer', 'torasMenachem'],
  mugah: true,
  maamorim: true,
  hagahos: true,
  hosofos: true,
};

export function downloadTargetKey(target: Omit<DownloadTarget, 'key'>): string {
  return target.kind === 'audio'
    ? `audio:${target.hebrewYear}:${target.occasionId}:${target.chapterIndex ?? -1}:${target.workerFilename ?? ''}`
    : `pdf:${target.hebrewYear}:${target.occasionId}:${target.driveFileId ?? ''}`;
}

function includePdf(pdf: CatalogPdf, contentTypes: DownloadContentTypes): boolean {
  if (pdf.section === 'biltiMugah') {
    return (
      isHighlightedFarbrengenHanacha(pdf) &&
      classifyPdfEdition(pdf.label).some((edition) => contentTypes.hanachaEditions.includes(edition))
    );
  }

  return contentTypes[pdf.section];
}

export function listDownloadTargets(entries: CatalogEntry[], contentTypes: DownloadContentTypes): DownloadTarget[] {
  const targets: DownloadTarget[] = [];

  for (const entry of entries) {
    if (contentTypes.audio) {
      entry.audio.forEach((chapter, chapterIndex) => {
        const target: Omit<DownloadTarget, 'key'> = {
          hebrewYear: entry.hebrewYear,
          occasionId: entry.occasionId,
          label: chapter.chapterName ?? `Track ${chapterIndex + 1}`,
          kind: 'audio',
          chapterIndex,
          workerFilename: chapter.workerFilename,
        };
        targets.push({ ...target, key: downloadTargetKey(target) });
      });
    }

    for (const pdf of entry.pdfs) {
      if (!includePdf(pdf, contentTypes)) continue;
      const target: Omit<DownloadTarget, 'key'> = {
        hebrewYear: entry.hebrewYear,
        occasionId: entry.occasionId,
        label: pdf.label,
        kind: 'pdf',
        driveFileId: pdf.driveFileId,
        resourceKey: pdf.resourceKey ?? null,
        section: pdf.section,
      };
      targets.push({ ...target, key: downloadTargetKey(target) });
    }
  }

  return targets;
}
