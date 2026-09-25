import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LibraryTranslations } from '../src/translate/library.js';
import type { LibraryEditions } from '../src/library/views.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The library names the translation rules can't do (src/translate/library.ts),
 * translated once and checked: translations/library-he.json (JEM's English
 * names -> Hebrew) and translations/library-en.json (mafteiach's Hebrew
 * names -> English). A missing file is an empty table.
 */
export async function loadLibraryTranslations(dir = path.join(__dirname, '..', 'translations')): Promise<LibraryTranslations> {
  const read = async (name: string): Promise<Record<string, string>> => {
    try {
      return JSON.parse(await readFile(path.join(dir, name), 'utf8')) as Record<string, string>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  };
  return { he: await read('library-he.json'), en: await read('library-en.json') };
}

/**
 * The printed editions the library places its items in, bibliographic
 * facts only (editions/): today ספר המאמרים מלוקט by the months of the
 * year. A missing file is no edition.
 */
export async function loadLibraryEditions(dir = path.join(__dirname, '..', 'editions')): Promise<LibraryEditions> {
  try {
    return { melukatByMonths: JSON.parse(await readFile(path.join(dir, 'melukat-new.json'), 'utf8')) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}
