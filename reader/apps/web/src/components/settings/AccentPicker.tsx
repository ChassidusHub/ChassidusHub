import { Check } from 'lucide-react';
import type { AccentPresetId } from '@chassidushub-reader/design';
import { ACCENT_PRESETS } from '@chassidushub-reader/design';
import { useTranslation } from '../../i18n/useLanguage';
import { useBaseScheme } from '../../settings/useResolvedScheme';

/** The theme colors as a row of swatches, each drawn as it looks in the theme now showing. */
export function AccentPicker({ value, onChange, label }: { value: AccentPresetId; onChange: (next: AccentPresetId) => void; label: string }) {
  const { language } = useTranslation();
  const scheme = useBaseScheme();
  return (
    <div role="radiogroup" aria-label={label} className="accent-picker">
      {ACCENT_PRESETS.map((preset) => {
        const colors = preset[scheme];
        const checked = preset.id === value;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={preset.name[language]}
            title={preset.name[language]}
            className="accent-swatch"
            style={{ background: colors.accent, color: colors.accentFg }}
            onClick={() => onChange(preset.id)}
          >
            {checked && <Check size={20} strokeWidth={3} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
