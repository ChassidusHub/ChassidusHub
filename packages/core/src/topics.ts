import { normalizeSearchText } from '@chassidushub/hebrew';

/**
 * A subject of Chassidus written in English letters, as people write it
 * ("bitachon", "ahavas yisroel", "hashgacha pratis"), and the Hebrew the
 * texts write it in (#99). The words of the texts are Hebrew, so
 * `bitachon` found nothing, and `simcha` found only farbrengens named
 * Simchas Torah. Taken only when it is all the words, as a parsha is.
 *
 * A small list kept by people, not a dictionary: each line is a subject
 * someone looked for and the spelling the texts use. Add to it as people
 * look for more.
 */
const TOPICS: ReadonlyArray<{ he: string; spellings: readonly string[] }> = [
  { he: 'בטחון', spellings: ['bitachon', 'bitochon', 'bitahon', 'bitchon'] },
  { he: 'אמונה', spellings: ['emunah', 'emuna', 'emunoh'] },
  { he: 'שמחה', spellings: ['simcha', 'simchah', 'simha'] },
  { he: 'אהבת ישראל', spellings: ['ahavas yisroel', 'ahavas yisrael', 'ahavat yisrael', 'ahavas yisruel'] },
  { he: 'אהבת השם', spellings: ['ahavas hashem', 'ahavat hashem'] },
  { he: 'יראת שמים', spellings: ['yiras shamayim', 'yirat shamayim', 'yiras shomayim'] },
  { he: 'השגחה פרטית', spellings: ['hashgacha pratis', 'hashgacha protis', 'hashgacha pratit', 'hashgochah protis'] },
  { he: 'תשובה', spellings: ['teshuvah', 'teshuva', 'tshuva', 'teshuvoh'] },
  { he: 'תפלה', spellings: ['tefillah', 'tefila', 'tefilla', 'tfila', 'tefilloh'] },
  { he: 'צדקה', spellings: ['tzedakah', 'tzedaka', 'tzedoko', 'tzedokoh'] },
  { he: 'משיח', spellings: ['moshiach', 'mashiach', 'moshiach tzidkeinu'] },
  { he: 'גאולה', spellings: ['geulah', 'geula', 'geuloh'] },
  { he: 'מסירת נפש', spellings: ['mesiras nefesh', 'mesirus nefesh', 'mesirat nefesh'] },
  { he: 'אחדות', spellings: ['achdus', 'achdut'] },
  { he: 'קבלת עול', spellings: ['kabbalas ol', 'kabolas ol', 'kabbalat ol'] },
  { he: 'חינוך', spellings: ['chinuch'] },
  { he: 'שליחות', spellings: ['shlichus', 'shlichut'] },
  { he: 'התקשרות', spellings: ['hiskashrus', 'hitkashrut'] },
  { he: 'אתכפיא', spellings: ['iskafya', 'iskafyo', 'itkafya'] },
  { he: 'אתהפכא', spellings: ['ishapcha', 'ishapchah', 'ithapcha'] },
  { he: 'דירה בתחתונים', spellings: ['dirah betachtonim', 'dira btachtonim', 'dirah b tachtonim'] },
  { he: 'ביטול', spellings: ['bittul', 'bitul'] },
  { he: 'מבצעים', spellings: ['mivtzoim', 'mivtzaim'] },
];

/** As a search compares words: lower case, marks and apostrophes gone, spaces single. */
const norm = (s: string) => normalizeSearchText(s.replace(/['’`]/g, ''));

const SPELLINGS = new Map<string, string>();
for (const topic of TOPICS) for (const spelling of topic.spellings) SPELLINGS.set(norm(spelling), topic.he);

/** Edit distance, for a mistyped spelling. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

/**
 * The subject the words are, when they are all of it in English letters
 * (`Bitachon`, `ahavas yisroel`, even `bitochen`): the words as typed and
 * the Hebrew to search for; else null. A spelling a letter or two off (a
 * fifth of its letters, none if two subjects are as close) still counts.
 */
export function topicOf(words: string): { key: string; he: string } | null {
  const key = norm(words);
  if (!key || !/^[a-z ]+$/.test(key)) return null;
  const exact = SPELLINGS.get(key);
  if (exact) return { key, he: exact };
  if (key.length < 5) return null;
  const budget = Math.floor(key.length / 5);
  let best: { he: string; d: number } | null = null;
  let tie = false;
  for (const [spelling, he] of SPELLINGS) {
    const d = distance(key, spelling);
    if (d > budget) continue;
    if (!best || d < best.d) {
      best = { he, d };
      tie = false;
    } else if (d === best.d && he !== best.he) tie = true;
  }
  return best && !tie ? { key, he: best.he } : null;
}
