import { useState } from 'react';
import { currentHebrewYear } from '@sichos-kodesh/catalog';
import { YearPickerScreen } from './screens/YearPickerScreen';
import { ThisWeekScreen } from './screens/ThisWeekScreen';
import { YearBrowserScreen } from './screens/YearBrowserScreen';

type View = { kind: 'pick' } | { kind: 'thisWeek'; sourceYear: number } | { kind: 'browseYear'; hebrewYear: number };

function App() {
  const targetYear = currentHebrewYear();
  const [view, setView] = useState<View>({ kind: 'pick' });

  if (view.kind === 'thisWeek') {
    return <ThisWeekScreen sourceYear={view.sourceYear} onBack={() => setView({ kind: 'pick' })} />;
  }
  if (view.kind === 'browseYear') {
    return <YearBrowserScreen hebrewYear={view.hebrewYear} onBack={() => setView({ kind: 'pick' })} />;
  }
  return (
    <YearPickerScreen
      targetYear={targetYear}
      onSelectKviusYear={(sourceYear) => setView({ kind: 'thisWeek', sourceYear })}
      onSelectBrowseYear={(hebrewYear) => setView({ kind: 'browseYear', hebrewYear })}
    />
  );
}

export default App;
