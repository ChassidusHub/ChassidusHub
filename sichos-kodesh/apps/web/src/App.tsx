import { useState } from 'react';
import { currentHebrewYear } from '@sichos-kodesh/catalog';
import { YearPickerScreen } from './screens/YearPickerScreen';
import { ThisWeekScreen } from './screens/ThisWeekScreen';

function App() {
  const targetYear = currentHebrewYear();
  const [sourceYear, setSourceYear] = useState<number | null>(null);

  return sourceYear === null ? (
    <YearPickerScreen targetYear={targetYear} onSelectYear={setSourceYear} />
  ) : (
    <ThisWeekScreen targetYear={targetYear} sourceYear={sourceYear} onBack={() => setSourceYear(null)} />
  );
}

export default App;
