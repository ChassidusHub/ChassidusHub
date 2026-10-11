/** A PDF of a page linked from the catalog (an item's editions). */
export interface Pdf {
  label: string;
  /** Where it opens. */
  url: string;
  /** A page that shows it inside another one (Google Drive's viewer), when there is one. */
  embed: string | null;
}

/** A Google Drive file's address in its embeddable form, or nothing for any other address. */
export function driveEmbed(url: string): string | undefined {
  const id = /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)/.exec(url)?.[1];
  return id ? `https://drive.google.com/file/d/${id}/preview` : undefined;
}

/** The PDFs the catalog links for the page (its editions), the printing of the page itself before a translation. */
export function pdfsOf(data: unknown): Pdf[] {
  const editions = (data as { editions?: unknown } | null)?.editions;
  if (!Array.isArray(editions)) return [];
  const pdfs = editions
    .filter((e): e is { url: string; role?: string; label?: string } => !!e && typeof e === 'object' && (e as { kind?: unknown }).kind === 'pdf' && typeof (e as { url?: unknown }).url === 'string' && /^https:\/\//.test((e as { url: string }).url))
    .map((e) => ({
      own: !e.role || e.role === 'sicha',
      label: e.label && e.label !== 'drive' ? e.label : 'הדף כפי שנדפס',
      url: e.url,
      embed: driveEmbed(e.url) ?? null,
    }));
  return [...pdfs.filter((p) => p.own), ...pdfs.filter((p) => !p.own)].map(({ own: _, ...pdf }) => pdf);
}
