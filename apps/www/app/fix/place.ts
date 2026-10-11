import type { FixAsk } from './types';

/**
 * Where a selection is in the page's words, for a fix: which item and
 * segment, and where in the segment's text it starts. The page's words carry
 * this in their markup already: the words' box says the item
 * (`data-fix-item`, and `data-fix-version`), and each segment's id says
 * which segment and what kind it is: `s-` a paragraph of the body, `n-` a
 * footnote (its words in `.nt`), `w-` a paragraph of a transcript.
 */
export interface Place extends Omit<FixAsk, 'words'> {
  /** The words selected, as a range of the page (trimmed of the spaces around them). */
  range: Range;
}

const kinds = { 's-': 'body', 'n-': 'note', 'w-': 'transcript' } as const;

/** The longest selection a fix takes: a few words, not a paragraph. */
export const MOST_SELECTED = 300;

function segmentOf(node: Node): { element: HTMLElement; text: HTMLElement; kind: FixAsk['kind']; id: string } | null {
  const from = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const element = from?.closest<HTMLElement>('p[id^="s-"], li[id^="n-"], [id^="w-"]');
  if (!element) return null;
  const prefix = element.id.slice(0, 2) as keyof typeof kinds;
  const text = prefix === 'n-' ? element.querySelector<HTMLElement>('.nt') : element;
  if (!text) return null;
  return { element, text, kind: kinds[prefix], id: element.id.slice(2) };
}

/** Characters of `root`'s text before the point (node, offset): the same count the server makes of the segment's runs (fix/replace.ts). */
function offsetIn(root: Node, node: Node, offset: number): number {
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(node, offset);
  return before.toString().length;
}

/** A range over `length` characters of `root`'s text from `at`: how a fix finds its words again (after signing in, or to mark them fixed). */
export function rangeAt(root: Node, at: number, length: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let pos = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const size = node.textContent?.length ?? 0;
    if (!started && at < pos + size) {
      range.setStart(node, at - pos);
      started = true;
    }
    if (started && at + length <= pos + size) {
      range.setEnd(node, at + length - pos);
      return range;
    }
    pos += size;
  }
  return null;
}

/**
 * The place of a selection, when it can be fixed: inside one segment of one
 * item's words, words only (no footnote's mark or marker in it), and short.
 * Null otherwise; it can still be copied or shared.
 */
export function placeOf(selection: Range): Place | null {
  // A double-click takes a footnote's mark written right after a word as part of it ("והערה1"): the mark is left out, and the word can be fixed.
  const range = selection.cloneRange();
  const markOf = (node: Node) => (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest('.nm, .mk');
  const endMark = markOf(range.endContainer);
  if (endMark) range.setEndBefore(endMark);
  const startMark = markOf(range.startContainer);
  if (startMark) range.setStartAfter(startMark);
  if (range.collapsed) return null;
  const start = segmentOf(range.startContainer);
  const end = segmentOf(range.endContainer);
  if (!start || !end || start.element !== end.element) return null;
  const box = start.element.closest<HTMLElement>('[data-fix-item]');
  if (!box?.dataset.fixItem) return null;
  if (!start.text.contains(range.startContainer) || !start.text.contains(range.endContainer)) return null;
  const inside = range.cloneContents();
  if (inside.querySelector('.nm, .mk')) return null;

  const raw = range.toString();
  const selected = raw.trim();
  if (!selected || selected.length > MOST_SELECTED) return null;
  const at = offsetIn(start.text, range.startContainer, range.startOffset) + (raw.length - raw.trimStart().length);
  const trimmed = rangeAt(start.text, at, selected.length);
  if (!trimmed) return null;
  return {
    kind: start.kind,
    item: box.dataset.fixItem,
    ...(box.dataset.fixVersion ? { version: box.dataset.fixVersion } : {}),
    segment: start.id,
    at,
    selected,
    range: trimmed,
  };
}

/** The same place found again in the page from what was kept of it (after signing in). */
export function placeAgain(ask: Omit<FixAsk, 'words'>): Place | null {
  const prefix = Object.entries(kinds).find(([, kind]) => kind === ask.kind)?.[0];
  const element = prefix ? document.getElementById(`${prefix}${ask.segment}`) : null;
  const found = element && segmentOf(element);
  if (!found) return null;
  const range = rangeAt(found.text, ask.at, ask.selected.length);
  if (!range || range.toString() !== ask.selected) return null;
  return { ...ask, range };
}
