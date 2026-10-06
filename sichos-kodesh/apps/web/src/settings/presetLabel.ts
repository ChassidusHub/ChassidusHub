import type { ContentPreset } from '@sichos-kodesh/app-core';
import type { useTranslation } from '../i18n/useLanguage';

type Translation = ReturnType<typeof useTranslation>['t'];

/** The user-facing name of a "what to keep" preset (see contentPreset in app-core). */
export function presetLabel(t: Translation, preset: ContentPreset): string {
  return preset === 'essentials' ? t.presetEssentials : preset === 'everything' ? t.presetEverything : t.presetCustom;
}
