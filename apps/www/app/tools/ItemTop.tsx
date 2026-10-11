import { pathLevels, type PathStep } from '../path';
import { TopBar, type PathLevel } from '../ui';

/** Which of an item's pages this is: its versions, its talk page, its shaar, its printings compared. */
export type Tool = 'history' | 'talk' | 'shaar' | 'compare';

const TOOLS: Record<Tool, string> = { history: 'היסטוריה', talk: 'שיחה', shaar: 'שער', compare: 'השוואת דפוסים' };

/**
 * The top of an item's tool page: the item's whole path, as on its own page,
 * and one more level for the page itself, whose choices are the item's other
 * pages (the page, its history, its talk page; a sefer's shaar; a sicha's
 * printings compared), so moving between them is the path bar too.
 */
export function ItemTop({ head, tool }: { head: { id: string; type: string; to: string; steps: PathStep[] }; tool: Tool }) {
  const pages: Tool[] = ['history', 'talk', ...(head.type === 'work' ? (['shaar'] as const) : []), ...(head.type === 'unit' ? (['compare'] as const) : [])];
  const here: PathLevel = {
    key: 'tool',
    label: TOOLS[tool],
    title: 'הדף',
    items: [
      { key: 'page', label: 'הדף עצמו', to: head.to },
      ...pages.map((page) => ({ key: page, label: TOOLS[page], to: `/${page}/${head.id}`, current: page === tool })),
    ],
  };
  return <TopBar path={[...pathLevels(head.steps), here]} />;
}
