import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The icon names (ui/Icon.tsx) and the shapes in ui/icons.svg are one list, kept in two files. */
describe('icons', () => {
  const svg = readFileSync(new URL('../app/ui/icons.svg', import.meta.url), 'utf8');
  const shapes = [...svg.matchAll(/<symbol id="i-([a-z0-9-]+)" viewBox="0 0 24 24">/g)].map((m) => m[1]);
  const names = [...readFileSync(new URL('../app/ui/Icon.tsx', import.meta.url), 'utf8').matchAll(/^ {2}'([a-z0-9-]+)',$/gm)].map((m) => m[1]);

  it('has a shape for every name, and no shape without one', () => {
    expect(names.length).toBeGreaterThan(20);
    expect(shapes).toEqual(names);
  });
});
