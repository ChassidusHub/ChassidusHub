import { Check } from 'lucide-react';
import type { PdfEdition } from '@sichos-kodesh/catalog';
import { useEditionPreference } from '../settings/editionPreference';
import { BackLink } from '../components/BackLink';

const OPTIONS: Array<{ value: PdfEdition | null; label: string }> = [
  { value: null, label: 'No preference' },
  { value: 'sichosKodesh', label: 'Sichos Kodesh (שיחו"ק)' },
  { value: 'sefer', label: 'Sefer (Sefer HaSichos / Sefer HaMaamarim)' },
  { value: 'torasMenachem', label: 'Toras Menachem' },
];

export function SettingsScreen() {
  const [preference, setPreference] = useEditionPreference();

  return (
    <div className="screen">
      <BackLink to="/">back</BackLink>
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
              {preference === option.value && <Check size={18} className="year-row-distance" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
