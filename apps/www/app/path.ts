import type { PathLevel } from './ui';

/** One level of an item's path as a loader sends it: what the page is at that level, and the other choices there. */
export interface PathStep {
  key: string;
  /** The menu's heading: what the choices at this level are. */
  title: string;
  label: string;
  choices: { path: string | null; label: string; end?: string; current?: boolean }[];
}

/** The first level of every path in the library: where in the site it is. */
const place: PathLevel = {
  key: 'place',
  label: 'ספרייה',
  icon: 'library',
  title: 'מקום',
  items: [
    { key: 'library', label: 'ספרייה', to: '/library', current: true },
    { key: 'listen', label: 'שמיעה', to: '/listen' },
  ],
};

/** An item's path for the path bar (ui/PathBar), with the library at its head. */
export function pathLevels(steps: PathStep[]): PathLevel[] {
  return [
    place,
    ...steps.map((step) => ({
      key: step.key,
      label: step.label,
      title: step.title,
      items: step.choices.map((choice, at) => ({
        key: `${at}`,
        label: choice.label,
        end: choice.end,
        to: choice.path ?? undefined,
        current: choice.current,
      })),
    })),
  ];
}
