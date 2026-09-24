import type { CatalogEntry, CatalogPdf, PdfEdition, PdfSection } from '@sichos-kodesh/catalog';
import { classifyPdfEdition, isHighlightedFarbrengenHanacha } from '@sichos-kodesh/catalog';
import { chapterTitle } from '../catalog/displayNames.js';
import type { Language } from '../search/language.js';

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

/**
 * What to call a target where the user sees it (a download notification):
 * a recording by its chapter name in the UI language (see `chapterTitle`),
 * looked up in its occasion's `entry`; a PDF, or a recording whose entry is
 * not at hand, by the target's own `label`.
 */
export function downloadTargetTitle(target: DownloadTarget, entry: Pick<CatalogEntry, 'audio'> | undefined, language: Language): string {
  if (target.kind === 'audio' && target.chapterIndex !== undefined) {
    const audio = entry?.audio[target.chapterIndex];
    if (audio && audio.workerFilename === target.workerFilename) return chapterTitle(audio, target.chapterIndex, language);
  }
  return target.label;
}

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
