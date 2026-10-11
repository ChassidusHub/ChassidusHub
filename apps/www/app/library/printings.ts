import type { Item } from '@chassidushub/client';
import { useEffect, useState } from 'react';
import { nameOf } from '../lib/catalog';
import { driveEmbed } from '../lib/pdfs';

/**
 * A sefer's printings (its publications) and where their scans can be read.
 * A page reads them after it has loaded, from the browser: the list is long
 * (Likkutei Sichos has 117), only the corner menu and the foot of a volume
 * show it, and it would hold up the page's first byte. A page asked to show
 * one scan (`?scan=`) reads them on the server instead.
 */

/** A printing of a sefer or a volume, and where its scan can be read. */
export interface Printing {
  key: string;
  title: string;
  /** Places to read the scan: an embeddable PDF (Google Drive), or a page elsewhere. */
  scans: Array<{ label: string; url: string; embed?: string }>;
}

const sourceNames: Record<string, string> = { hebrewbooks: 'HebrewBooks', other: '' };

function printingOf(publication: Item): Printing {
  const data = publication.data as { title?: unknown; sources?: Array<{ url?: string; note?: string; source?: string }> };
  const scans = (data.sources ?? [])
    .filter((s): s is { url: string; note?: string; source?: string } => typeof s.url === 'string' && /^https:\/\//.test(s.url))
    .map((s) => ({ label: sourceNames[s.source ?? ''] || s.note || new URL(s.url).hostname, url: s.url, embed: driveEmbed(s.url) }));
  return { key: publication.id, title: nameOf(data.title, publication.id), scans };
}

/** Letters only: "י״ב", "יב" and "יב (ויקרא)" all come to "יב". */
const letters = (text: string) => (text.replace(/^חלק\s+/, '').split(/[\s(]/)[0] ?? '').replace(/[״׳"']/g, '');

/** Whether a printing is of one volume: its volume is "12", or "יב (ויקרא)" for חלק י״ב. */
function ofVolume(publication: Item, volume: { value: string; label: string }): boolean {
  const printed = String((publication.data as { volume?: unknown }).volume ?? '');
  if (!printed) return false;
  if (printed === volume.value) return true;
  const hebrew = letters(volume.label);
  return !!hebrew && letters(printed) === hebrew;
}

/** The printings of a sefer, or of one of its volumes, that have a scan to read. */
export function printingsFrom(publications: Item[], volume?: { value: string; label: string }): Printing[] {
  return publications
    .filter((p) => !volume || ofVolume(p, volume))
    .map(printingOf)
    .filter((p) => p.scans.length);
}

/** The words in a printing's title after the sefer's name: "לקוטי שיחות - יב (ויקרא)" is ויקרא. */
export const aboutOf = (title: string) => /\(([^)]+)\)\s*$/.exec(title)?.[1]?.replace(/\s+-\s+/g, ' · ');

/** The address of a sefer's printings in the API. */
export const printingsUrl = (api: string, work: string) => `${api}/v1/entities/${encodeURIComponent(work)}/linked?field=work&type=publication&limit=500`;

/** The printings a page shows: those it was given, else read once it has loaded. */
export function usePrintings(api: string, work: string, given: Printing[] | null, volume?: { value: string; label: string }): Printing[] {
  const [read, setRead] = useState<Printing[] | null>(null);
  const value = volume?.value;
  const label = volume?.label;
  useEffect(() => {
    if (given) return;
    let live = true;
    setRead(null);
    fetch(printingsUrl(api, work))
      .then((response) => (response.ok ? (response.json() as Promise<{ items: Item[] }>) : { items: [] }))
      .then(({ items }) => live && setRead(printingsFrom(items, value !== undefined && label !== undefined ? { value, label } : undefined)))
      .catch(() => live && setRead([]));
    return () => {
      live = false;
    };
  }, [api, work, given, value, label]);
  return given ?? read ?? [];
}
