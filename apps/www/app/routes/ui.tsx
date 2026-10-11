import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Chips,
  Icon,
  IconButton,
  iconNames,
  Logo,
  PathBar,
  PlayButton,
  Row,
  Rows,
  SearchField,
  SectionHead,
  Segmented,
  Sheet,
  Tile,
  useToast,
  type PathLevel,
} from '../ui';
import type { Route } from './+types/ui';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'רכיבי העיצוב · ChassidusHub' }];
}

const hebrewNumber = (n: number) => {
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const tens = ['', 'י', 'כ', 'ל'];
  const letters = n === 15 ? 'טו' : n === 16 ? 'טז' : tens[Math.floor(n / 10)]! + ones[n % 10]!;
  return letters.length > 1 ? `${letters.slice(0, -1)}״${letters.slice(-1)}` : `${letters}׳`;
};

/** The prototype's sample path, to try the path bar and its menus. */
const path: PathLevel[] = [
  { key: 'place', label: 'ספרייה', icon: 'library', title: 'מקום', items: [{ key: 'library', label: 'ספרייה', to: '/ui', current: true }, { key: 'listen', label: 'שמיעה', to: '/ui' }] },
  {
    key: 'rebbe',
    label: 'הרבי',
    title: 'רבותינו נשיאינו',
    items: ['הבעל שם טוב', 'המגיד ממעזריטש', 'אדמו״ר הזקן', 'אדמו״ר האמצעי', 'הצמח צדק', 'אדמו״ר מהר״ש', 'אדמו״ר הרש״ב', 'אדמו״ר הריי״צ', 'הרבי'].map((label, at) => ({ key: String(at), label, current: label === 'הרבי', to: label === 'הרבי' ? '/ui' : undefined })),
  },
  { key: 'sefer', label: 'ליקוטי שיחות', title: 'ספרי הרבי', items: [{ key: 'ls', label: 'ליקוטי שיחות', end: '39 חלקים', current: true, to: '/ui' }, { key: 'tm', label: 'תורת מנחם', end: 'התוועדויות' }, { key: 'ik', label: 'אגרות קודש', end: '33 כרכים' }] },
  {
    key: 'volume',
    label: 'חלק י״ב',
    title: 'חלקי ליקוטי שיחות',
    // Fetched when opened, as the real lists will be.
    items: () => new Promise((done) => setTimeout(() => done(Array.from({ length: 39 }, (_, at) => ({ key: String(at + 1), label: `חלק ${hebrewNumber(at + 1)}`, also: String(at + 1), current: at === 11, to: at === 11 ? '/ui' : undefined }))), 300)),
  },
  { key: 'sicha', label: 'שמיני א', title: 'השיחות בחלק י״ב', items: [{ key: 'a', label: 'ויקרא א' }, { key: 'b', label: 'צו א' }, { key: 'c', label: 'שמיני א', current: true, to: '/ui' }, { key: 'd', label: 'תזריע א' }] },
];

/**
 * Every piece of the design system on one page, in both themes, for the
 * screen threads to build from and for reviewers to check against the
 * prototype. Hidden from search engines like the rest of the beta.
 */
export default function DesignSystem() {
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [filter, setFilter] = useState('הכול');
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', height: 52, paddingInline: 8 }}>
        <PathBar levels={path} />
      </header>
      <main className="view">
        <h1>רכיבי העיצוב</h1>
        <p className="faint">כל חלקי העיצוב של האתר החדש, כפי שהם באב־הטיפוס. מסכים נבנים רק מהם.</p>

        <SectionHead title="סמל" />
        <Logo />

        <SectionHead title="אותיות" />
        <p className="title-face" style={{ fontSize: 30, margin: 0 }}>ליקוטי שיחות</p>
        <p className="torah-face" style={{ fontSize: 'var(--torah-size)', lineHeight: 1.85 }}>
          בְּרֵאשִׁית בָּרָא אֱלֹקִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ. ידוע הפירוש בזה, שבכל דבר ודבר יש בו כח הפועל בנפעל.
        </p>
        <span className="machine">נקרא במכונה ועוד לא נבדק</span>

        <SectionHead title="כפתורים" />
        <div className="chips" style={{ alignItems: 'center' }}>
          <Button>המשך לקרוא</Button>
          <Button look="outline" icon="share">שיתוף</Button>
          <Button look="ghost">ביטול</Button>
          <IconButton icon="more" label="עוד" />
          <PlayButton playing={playing} onClick={() => setPlaying(!playing)} />
          <PlayButton playing={playing} size="small" onClick={() => setPlaying(!playing)} />
        </div>

        <SectionHead title="שורות" more={{ label: 'הכול', to: '/ui' }} />
        <Rows>
          <Row title="שמיני א" sub="חלק י״ב · עמ׳ 43" to="/ui" />
          <Row title="י״ט כסלו תשמ״ז" sub="התוועדות" end="3:12:40" start={<PlayButton playing={false} size="small" />} />
          <Row title="ספר המאמרים מלוקט" sub="6 כרכים" to="/ui" />
        </Rows>

        <SectionHead title="אריחים" />
        <div className="tiles">
          <Tile icon="listen" kicker="להמשיך לשמוע" title="י״ט כסלו תשמ״ז" sub="נשארו 42 דקות" to="/ui" />
          <Tile icon="book" kicker="להמשיך ללמוד" title="ליקוטי שיחות חלק י״ב" sub="שמיני א" to="/ui" />
        </div>
        <div className="boxes" style={{ marginTop: 10 }}>
          <Box title="אדמו״ר הזקן" sub="תניא · תורה אור · שולחן ערוך" to="/ui" />
          <Box title="הצמח צדק" sub="אור התורה · דרך מצוותיך" to="/ui" />
          <Box title="הרבי" sub="ליקוטי שיחות · תורת מנחם · אגרות קודש" to="/ui" />
        </div>

        <SectionHead title="בחירות" />
        <Chips label="סינון">
          {['הכול', 'ספרים', 'התוועדויות', 'בתוך הטקסט'].map((label) => (
            <Chip key={label} on={filter === label} onClick={() => setFilter(label)}>
              {label}
            </Chip>
          ))}
        </Chips>
        <div style={{ marginTop: 12 }}>
          <Segmented label="מהירות" value={speed} onChange={setSpeed} options={[1, 1.25, 1.5].map((value) => ({ value, label: <bdi dir="ltr">{value}×</bdi> }))} />
        </div>

        <SectionHead title="חיפוש" />
        <SearchField size="big" label="חיפוש בכל הספרייה" />
        <div style={{ height: 10 }} />
        <SearchField label="חיפוש" />

        <SectionHead title="חלונות" />
        <div className="chips">
          <Button look="outline" onClick={() => setSheet(true)}>פתיחת גיליון</Button>
          <Button look="outline" onClick={() => toast('התיקון עלה לאתר', { label: 'ביטול', run: () => toast('התיקון בוטל') })}>הודעה עם ביטול</Button>
        </div>
        <Sheet open={sheet} title="הערה 12" onClose={() => setSheet(false)}>
          <p className="torah-face" style={{ fontSize: 18, lineHeight: 1.7, margin: 0 }}>ראה לקמן סעיף ה. ובכ״מ.</p>
        </Sheet>

        <SectionHead title="סמלים" />
        <div className="numgrid">
          {iconNames.map((name) => (
            <span key={name} title={name}>
              <Icon name={name} />
            </span>
          ))}
        </div>
      </main>
    </>
  );
}
