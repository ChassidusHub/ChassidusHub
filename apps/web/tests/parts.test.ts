import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Chip, Sheet, Switch } from '../app/ui/primitives.js';

/**
 * The design system's new parts (design/system, board 2), as the server
 * draws them: what a screen reader is told, and what the styles hang on.
 */

const draw = (node: ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, node));

describe('Switch', () => {
  it('is a button with role switch, its state and its label said', () => {
    const html = draw(createElement(Switch, { checked: true, onChange: () => {}, label: 'Pause on tap' }));
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="Pause on tap"');
    expect(html).not.toContain('switch-row');
  });

  it('draws its label beside it when asked, and is not said twice', () => {
    const html = draw(createElement(Switch, { checked: false, onChange: () => {}, label: 'Pause on tap', show: true }));
    expect(html).toContain('class="switch-row"');
    expect(html).toContain('>Pause on tap</span>');
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain('aria-label=');
  });
});

describe('Chip', () => {
  it('is a pressed button when it is a choice', () => {
    const html = draw(createElement(Chip, { children: 'Tanya', pressed: true, onClick: () => {} }));
    expect(html).toMatch(/^<button type="button" class="chip" aria-pressed="true">Tanya<\/button>$/);
  });

  it('is a link, in its tone, when it leads somewhere', () => {
    const html = draw(createElement(Chip, { children: 'Fix', to: '/fix', tone: 'accent' }));
    expect(html).toContain('href="/fix"');
    expect(html).toContain('class="chip chip-accent"');
    expect(html).not.toContain('aria-pressed');
  });
});

describe('Sheet', () => {
  it('draws nothing while closed', () => {
    expect(draw(createElement(Sheet, { open: false, onClose: () => {}, title: 'Fix', children: 'x' }))).toBe('');
  });

  it('is a modal dialog named by its title, with its footer', () => {
    const html = draw(createElement(Sheet, { open: true, onClose: () => {}, title: 'Fix', children: 'body', footer: 'Send' }));
    expect(html).toContain('class="ds-sheet-backdrop"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-labelledby="([^"]+)".*<h2 id="\1" class="ds-sheet-title">Fix<\/h2>/);
    expect(html).toContain('<div class="ds-sheet-body">body</div>');
    expect(html).toContain('<div class="ds-sheet-foot">Send</div>');
  });

  it('is named by its label when it has no title', () => {
    const html = draw(createElement(Sheet, { open: true, onClose: () => {}, label: 'More', children: 'x' }));
    expect(html).toContain('aria-label="More"');
    expect(html).not.toContain('<h2');
  });
});
