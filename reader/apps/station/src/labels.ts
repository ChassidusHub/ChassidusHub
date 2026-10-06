/** Sizes as the station shows them: 74 MB, 1.2 GB (the download site's formatMb). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** Characters no file system takes, and quotes in their Hebrew forms (the phone's export does the same). */
export function safeName(text: string): string {
  return text
    .replace(/"/g, '״')
    .replace(/'/g, '׳')
    .replace(/[\\/:*?<>|]/g, ' ')
    .split('')
    .map((ch) => (ch.charCodeAt(0) < 32 ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
}
