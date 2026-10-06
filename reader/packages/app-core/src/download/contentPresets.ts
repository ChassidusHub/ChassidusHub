import type { DownloadContentTypes } from './downloadTargets.js';
import { ALL_CONTENT_TYPES } from './downloadTargets.js';

/**
 * The settings screen asks "what to keep offline" as one plain choice
 * before it offers the seven individual types: the farbrengen's own
 * recording and hanacha (what its page opens with), or everything
 * (mugah, maamorim, hagahos and hosofos too). `custom` is whatever mix the
 * user picked by hand - never something a preset produces, only ever
 * detected from a hand-edited `contentTypes`.
 */
export type ContentPreset = 'essentials' | 'everything' | 'custom';

/** Recording + both hanacha editions - the default, and what the farbrengen page itself leads with. */
export const ESSENTIAL_CONTENT_TYPES: DownloadContentTypes = {
  audio: true,
  hanachaEditions: ['sichosKodesh', 'torasMenachem'],
  mugah: false,
  maamorim: false,
  hagahos: false,
  hosofos: false,
};

function sameEditions(a: DownloadContentTypes['hanachaEditions'], b: DownloadContentTypes['hanachaEditions']): boolean {
  return a.length === b.length && a.every((edition) => b.includes(edition));
}

function sameContentTypes(a: DownloadContentTypes, b: DownloadContentTypes): boolean {
  return a.audio === b.audio && a.mugah === b.mugah && a.maamorim === b.maamorim && a.hagahos === b.hagahos && a.hosofos === b.hosofos && sameEditions(a.hanachaEditions, b.hanachaEditions);
}

/** Which preset `contentTypes` currently equals, or `custom` when it matches neither. */
export function contentPreset(contentTypes: DownloadContentTypes): ContentPreset {
  if (sameContentTypes(contentTypes, ESSENTIAL_CONTENT_TYPES)) return 'essentials';
  if (sameContentTypes(contentTypes, ALL_CONTENT_TYPES)) return 'everything';
  return 'custom';
}

/** The `contentTypes` a preset stands for (`custom` has none of its own - the caller keeps what it has). */
export function presetContentTypes(preset: Exclude<ContentPreset, 'custom'>): DownloadContentTypes {
  return preset === 'everything' ? { ...ALL_CONTENT_TYPES, hanachaEditions: [...ALL_CONTENT_TYPES.hanachaEditions] } : { ...ESSENTIAL_CONTENT_TYPES, hanachaEditions: [...ESSENTIAL_CONTENT_TYPES.hanachaEditions] };
}
