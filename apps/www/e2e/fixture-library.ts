/**
 * The library in the stand-in API (fixture-api.ts): a made-up shelf of the
 * Rebbe's with one sefer of thirteen volumes and an index to it, and two other
 * top shelves (one empty), so the library's screens are tested without the
 * live catalog. Listening's shelves (fixture-listen.ts) are the top of it.
 * Every name here is sample text written for the tests (לדוגמה).
 */
const he = (text: string) => ({ he: text });
const letters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'יא', 'יב', 'יג'];
const gershayim = (n: number) => (letters[n - 1]!.length > 1 ? `${letters[n - 1]![0]}״${letters[n - 1]![1]}` : `${letters[n - 1]}׳`);

const shelves = [
  { id: 'rh-aaaaaal1', type: 'set', path: '/sets/the-rebbe-sample-sichos', data: { slug: 'the-rebbe-sample-sichos', name: he('שיחות לדוגמה'), order: 'a', parent: 'rh-aaaaaas3' } },
  { id: 'rh-aaaaaal2', type: 'set', path: '/sets/sample-more', data: { slug: 'sample-more', name: he('ספרים נוספים לדוגמה'), order: 'm' } },
  { id: 'rh-aaaaaal3', type: 'set', path: '/sets/sample-empty', data: { slug: 'sample-empty', name: he('מדף ריק לדוגמה'), order: 'n' } },
];

const sefer = { id: 'rh-aaaaaaw1', type: 'work', path: '/sample-sichos', rev: 1, data: { title: he('שיחות לדוגמה'), sets: ['rh-aaaaaal1'], levels: ['volume', 'sicha'] } };
const index = { id: 'rh-aaaaaaw2', type: 'work', path: '/sample-sichos-index', rev: 1, data: { title: he('מפתח לדוגמה'), sets: ['rh-aaaaaal1'], addition: { to: 'rh-aaaaaaw1', kind: 'index' } } };
const others = [
  { id: 'rh-aaaaaaw3', type: 'work', path: '/sample-one', rev: 1, data: { title: he('ספר ראשון לדוגמה'), sets: ['rh-aaaaaal2'] } },
  { id: 'rh-aaaaaaw4', type: 'work', path: '/sample-two', rev: 1, data: { title: he('ספר שני לדוגמה'), sets: ['rh-aaaaaal2'] } },
];
const works: Array<{ id: string; path: string; data: { title: unknown; sets: string[]; addition?: { to: string } } }> = [sefer, index, ...others];

const parts = letters.map((_, at) => ({ value: String(at + 1), label: he(`חלק ${gershayim(at + 1)}`), units: 3 }));
const choice = (item: { id: string; path: string | null; data: { name?: unknown; title?: unknown } }) => ({ id: item.id, path: item.path, name: item.data.name ?? item.data.title });

/** The answer to a library read, or undefined when it is not one; `top` is every shelf there is. */
export function libraryAnswer(url: URL, top: Array<{ id: string; path: string; data: { name: unknown; parent?: string } }>): unknown {
  const query = (name: string) => url.searchParams.get(name);
  const path = url.pathname;
  const sets = [...top, ...shelves];
  const rebbe = sets.find((set) => set.id === 'rh-aaaaaas3')!;
  const tops = sets.filter((set) => !set.data.parent);
  const topLevel = (set: (typeof sets)[number]) => ({ kind: 'set', chosen: choice(set), choices: tops.map(choice) });
  const shelfLevel = { kind: 'set', chosen: choice(shelves[0]!), choices: [choice(shelves[0]!)] };
  const seferLevel = { kind: 'work', chosen: choice(sefer), choices: [choice(sefer)] };
  if (path === '/v1/entities' && query('type') === 'set') return { items: sets };
  // One item, as Edit reads it before a rename.
  const entity = /^\/v1\/entities\/(rh-[\w-]+)$/.exec(path)?.[1];
  if (entity) {
    const found = [...sets, ...works].find((item) => item.id === entity);
    return found ? { rev: 1, ...found } : undefined;
  }
  if (path === '/v1/view') {
    const at = query('path');
    if (at === rebbe.path) return { item: { rev: 1, ...rebbe }, pathBar: [topLevel(rebbe)], previous: null, next: null, text: null };
    if (at === shelves[0]!.path) return { item: { rev: 1, ...shelves[0] }, pathBar: [topLevel(rebbe), shelfLevel], previous: null, next: null, text: null };
    if (at === sefer.path) return { item: sefer, pathBar: [topLevel(rebbe), shelfLevel, seferLevel], previous: null, next: null, text: null };
    return undefined;
  }
  const linked = path.match(/^\/v1\/entities\/([^/]+)\/linked$/);
  if (linked) {
    const id = linked[1]!;
    const field = query('field');
    const items =
      field === 'sets' ? works.filter((work) => work.data.sets.includes(id)) : field === 'addition.to' ? works.filter((work) => work.data.addition?.to === id) : [];
    const some = items.slice(0, Number(query('limit') ?? 50));
    return { items: some, total: items.length, next: null };
  }
  if (path === `/v1/works/${sefer.id}/outline`) return { parts };
  const part = path.match(new RegExp(`^/v1/works/${sefer.id}/parts/(\\d+)$`));
  if (part && Number(part[1]) >= 1 && Number(part[1]) <= parts.length) {
    const value = part[1]!;
    return {
      items: [1, 2, 3].map((n) => ({
        id: `rh-aaaau${value.padStart(2, '0')}${n}`,
        type: 'unit',
        path: `/sample-sichos/${value}/${n}`,
        rev: 1,
        data: { work: sefer.id, label: he(`שיחה ${gershayim(n)} לדוגמה`), position: [{ label: parts[Number(value) - 1]!.label, level: 'volume', value }, { label: he(`עמ' ${n * 10}`), level: 'sicha', value: String(n) }] },
      })),
    };
  }
  return undefined;
}
