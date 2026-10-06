import { DEFAULT_PDF_LOOK, PDF_COLORS, PDF_PAGINGS } from '@sichos-kodesh/app-core';
import type { PdfColors, PdfLook } from '@sichos-kodesh/app-core';
import { SettingsSheet } from '../components/SettingsSheet';
import { Segmented, SettingRow, Toggle } from '../components/settings/SettingsControls';
import { useTranslation } from '../i18n/useLanguage';
import { setPdfLook } from '../settings/pdfLook';

/** Each colour choice drawn as a small page: its paper and its ink (the phone's PdfSettingsSheet). */
const SWATCHES: Record<PdfColors, { paper: string; ink: string }> = {
  original: { paper: '#ffffff', ink: '#121212' },
  sepia: { paper: '#f3e6cc', ink: '#4a3a26' },
  gray: { paper: '#e6e6e6', ink: '#1f1f1f' },
  dark: { paper: '#121212', ink: '#ededed' },
};

interface Props {
  look: PdfLook;
  /** The colours on screen now: dark, or the tint. */
  colors: PdfColors;
  /** Dark is the per-theme switch it always was; any other choice turns it off. */
  onColors: (colors: PdfColors) => void;
  onClose: () => void;
}

/**
 * The PDF reader's settings - the text reader's sheet, without the text's
 * own options: the colours of the pages, a stronger contrast, a page at a
 * time or one long scroll, and keeping the screen on.
 */
export function PdfSettingsPanel({ look, colors, onColors, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <SettingsSheet title={t.pdfSettings} onClose={onClose}>
      <span className="reader-eyebrow">{t.pdfColors}</span>
      <div className="reader-themes" role="radiogroup" aria-label={t.pdfColors}>
        {PDF_COLORS.map((choice) => (
          <button key={choice} type="button" role="radio" aria-checked={choice === colors} className={choice === colors ? 'reader-theme reader-theme-active' : 'reader-theme'} onClick={() => onColors(choice)}>
            <span className="reader-swatch pdf-swatch" style={{ background: SWATCHES[choice].paper, color: SWATCHES[choice].ink }} aria-hidden>
              א
            </span>
            <span className="reader-theme-name">{t.pdfColorNames[choice]}</span>
          </button>
        ))}
      </div>
      <p className="tab-help pdf-settings-note">{t.pdfDarkNote}</p>

      <div className="settings-card">
        <SettingRow label={t.pdfContrast} help={t.pdfContrastHelp} onClick={() => setPdfLook({ contrast: !look.contrast })}>
          <Toggle checked={look.contrast} label={t.pdfContrast} decorative />
        </SettingRow>
      </div>

      <span className="reader-eyebrow">{t.pdfDisplay}</span>
      <div className="settings-card">
        <SettingRow label={t.pdfPaging} stack>
          <Segmented label={t.pdfPaging} value={look.paging} onChange={(paging) => setPdfLook({ paging })} options={PDF_PAGINGS.map((value) => ({ value, label: t.pdfPagings[value] }))} />
        </SettingRow>
        <SettingRow label={t.readerKeepAwake} onClick={() => setPdfLook({ keepAwake: !look.keepAwake })}>
          <Toggle checked={look.keepAwake} label={t.readerKeepAwake} decorative />
        </SettingRow>
      </div>

      <button
        type="button"
        className="reader-reset"
        onClick={() => {
          setPdfLook(DEFAULT_PDF_LOOK);
          if (colors !== 'dark') onColors('original');
        }}
      >
        {t.readerReset}
      </button>
    </SettingsSheet>
  );
}
