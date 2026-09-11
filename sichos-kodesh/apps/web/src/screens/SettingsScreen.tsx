import type { PdfEdition } from '@sichos-kodesh/catalog';
import { useEditionPreference } from '../settings/editionPreference';

interface Props {
  onBack: () => void;
}

const OPTIONS: Array<{ value: PdfEdition | null; label: string }> = [
  { value: null, label: 'No preference' },
  { value: 'sefer', label: 'Sefer (Sefer HaSichos / Sefer HaMaamarim)' },
  { value: 'torasMenachem', label: 'Toras Menachem' },
];

export function SettingsScreen({ onBack }: Props) {
  const [preference, setPreference] = useEditionPreference();

  return (
    <div className="screen">
      <button className="back-link" onClick={onBack}>
        {'< back'}
      </button>
      <h1>Settings</h1>
      <p className="subtitle">
        When an occasion has PDFs from more than one printed edition, show this one first.
      </p>
      <ul className="year-list">
        {OPTIONS.map((option) => (
          <li key={option.label}>
            <button
              className={preference === option.value ? 'year-row year-row-selected' : 'year-row'}
              onClick={() => setPreference(option.value)}
            >
              <span className="year-row-year">{option.label}</span>
              {preference === option.value && <span className="year-row-distance">✓</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
