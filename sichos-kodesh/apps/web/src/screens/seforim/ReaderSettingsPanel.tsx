import { useEffect, useRef } from 'react';
import { AArrowDown, AArrowUp, X } from 'lucide-react';
import { DEFAULT_READER_SETTINGS, FONT_SCALE_MAX, FONT_SCALE_MIN, READER_FONTS, READER_MARGINS, READER_SPACINGS, READER_THEME_IDS, clampScale, type ReaderSettings } from '@sichos-kodesh/app-core';
import { Segmented, SettingRow, Toggle } from '../../components/settings/SettingsControls';
import { useTranslation } from '../../i18n/useLanguage';
import { fontStack, readerPalette } from '../../seforim/readerPalette';
import { setReaderSettings } from '../../seforim/readingState';

/** How each font shows itself in the picker: a word with its vowels, so the pointing can be judged too. */
const SAMPLE = 'בְּרֵאשִׁית';

interface Props {
  settings: ReaderSettings;
  onClose: () => void;
}

/**
 * The reader's settings, the same as the phone's: size, font, paper,
 * spacing, margins, where the notes go, and the switches. Each change
 * shows at once on the text behind the panel; Escape or a click outside
 * closes it.
 */
export function ReaderSettingsPanel({ settings, onClose }: Props) {
  const { t, language } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  const set = (change: Partial<ReaderSettings>) => setReaderSettings(change);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="reader-panel-backdrop" onClick={onClose} role="presentation">
      <div ref={panel} tabIndex={-1} className="reader-panel" role="dialog" aria-modal="true" aria-label={t.readerSettings} onClick={(event) => event.stopPropagation()}>
        <div className="reader-panel-head">
          <h2>{t.readerSettings}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t.readerClose}>
            <X size={20} aria-hidden />
          </button>
        </div>

        <div className="reader-size">
          <button type="button" className="icon-button" onClick={() => set({ scale: clampScale(settings.scale - 0.1) })} disabled={settings.scale <= FONT_SCALE_MIN} aria-label={t.readerTextSmaller}>
            <AArrowDown size={22} aria-hidden />
          </button>
          <div className="reader-size-value">
            <span className="reader-eyebrow">{t.readerSize}</span>
            <span className="reader-size-percent">{Math.round(settings.scale * 100)}%</span>
          </div>
          <button type="button" className="icon-button" onClick={() => set({ scale: clampScale(settings.scale + 0.1) })} disabled={settings.scale >= FONT_SCALE_MAX} aria-label={t.readerTextLarger}>
            <AArrowUp size={22} aria-hidden />
          </button>
        </div>

        <span className="reader-eyebrow">{t.readerFont}</span>
        <div className="reader-fonts" role="radiogroup" aria-label={t.readerFont}>
          {READER_FONTS.map((font) => (
            <button
              key={font.id}
              type="button"
              role="radio"
              aria-checked={font.id === settings.font}
              className={font.id === settings.font ? 'reader-font reader-font-active' : 'reader-font'}
              onClick={() => set({ font: font.id, fontChosen: true })}
            >
              <span className="reader-font-sample" style={{ fontFamily: fontStack(font.family) }} lang="he">
                {SAMPLE}
              </span>
              <span className="reader-font-name">{font.name[language]}</span>
            </button>
          ))}
        </div>

        <span className="reader-eyebrow">{t.readerTheme}</span>
        <div className="reader-themes" role="radiogroup" aria-label={t.readerTheme}>
          {READER_THEME_IDS.map((theme) => {
            const swatch = readerPalette(theme);
            return (
              <button key={theme} type="button" role="radio" aria-checked={theme === settings.theme} className={theme === settings.theme ? 'reader-theme reader-theme-active' : 'reader-theme'} onClick={() => set({ theme })}>
                <span className={theme === 'app' ? 'reader-swatch reader-swatch-app' : 'reader-swatch'} style={{ background: swatch.background, color: swatch.text }} aria-hidden>
                  א
                </span>
                <span className="reader-theme-name">{t.readerThemes[theme]}</span>
              </button>
            );
          })}
        </div>

        <div className="settings-card">
          <SettingRow label={t.readerSpacing} stack>
            <Segmented label={t.readerSpacing} value={settings.spacing} onChange={(spacing) => set({ spacing })} options={READER_SPACINGS.map((value) => ({ value, label: t.readerSpacings[value] }))} />
          </SettingRow>
          <SettingRow label={t.readerMargins} stack>
            <Segmented label={t.readerMargins} value={settings.margins} onChange={(margins) => set({ margins })} options={READER_MARGINS.map((value) => ({ value, label: t.readerMarginSizes[value] }))} />
          </SettingRow>
          <SettingRow label={t.readerNotesPlace} stack>
            <Segmented label={t.readerNotesPlace} value={settings.notes} onChange={(notes) => set({ notes })} options={(['end', 'inline'] as const).map((value) => ({ value, label: t.readerNotesPlaces[value] }))} />
          </SettingRow>
        </div>

        <div className="settings-card">
          <SettingRow label={t.readerNiqqud} onClick={() => set({ niqqud: !settings.niqqud })}>
            <Toggle checked={settings.niqqud} label={t.readerNiqqud} decorative />
          </SettingRow>
          <SettingRow label={t.readerJustify} onClick={() => set({ justify: !settings.justify })}>
            <Toggle checked={settings.justify} label={t.readerJustify} decorative />
          </SettingRow>
          <SettingRow label={t.readerMarks} onClick={() => set({ marks: !settings.marks })}>
            <Toggle checked={settings.marks} label={t.readerMarks} decorative />
          </SettingRow>
          <SettingRow label={t.readerContinuous} onClick={() => set({ continuous: !settings.continuous })}>
            <Toggle checked={settings.continuous} label={t.readerContinuous} decorative />
          </SettingRow>
          <SettingRow label={t.readerKeepAwake} onClick={() => set({ keepAwake: !settings.keepAwake })}>
            <Toggle checked={settings.keepAwake} label={t.readerKeepAwake} decorative />
          </SettingRow>
        </div>

        <p className="tab-help">{t.readerShareHint}</p>
        <button type="button" className="reader-reset" onClick={() => setReaderSettings(DEFAULT_READER_SETTINGS)}>
          {t.readerReset}
        </button>
      </div>
    </div>
  );
}
