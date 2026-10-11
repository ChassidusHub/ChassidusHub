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
  PlayButton,
  Row,
  Rows,
  SearchField,
  SectionHead,
  Segmented,
  Sheet,
  Tile,
  TopBar,
  player,
  useToast,
  type PathLevel,
  type Track,
} from '../ui';
import type { Route } from './+types/ui';

export const handle = { section: 'library' };

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

/** Silence as a WAV file, to try the player without a real recording. */
function silence(seconds: number): string {
  const rate = 8000;
  const bytes = new Uint8Array(44 + seconds * rate);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true); // 8-bit, where 128 is silence
  text(36, 'data');
  view.setUint32(40, seconds * rate, true);
  bytes.fill(128, 44);
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

/** A made-up recording in three parts of 30 seconds, the first and last with words, to try the player. */
function sample(): Track {
  const words = ['זהו', 'משפט', 'לדוגמה', 'בלבד', 'כדי', 'לראות', 'איך', 'המילים', 'נדלקות', 'בזמן', 'השמיעה'];
  const phrases = Array.from({ length: 10 }, (_, i) => ({ text: words.slice(0, 4 + (i % 6)).join(' '), start: i * 3000 }));
  return {
    id: 'sample',
    title: 'הקלטה לדוגמה',
    to: '/ui',
    src: silence(90),
    chapters: [
      { title: 'שיחה א', start: 0, duration: 30_000 },
      { title: 'ניגון', start: 30_000, duration: 30_000 },
      { title: 'שיחה ב', start: 60_000, duration: 30_000 },
    ],
    words: async (chapter) => (chapter === 1 ? null : { phrases, checked: false }),
  };
}

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
      <TopBar path={path} />
      <main id="content" className="view">
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

        <SectionHead title="נגן" />
        <Button look="outline" icon="play" onClick={() => player.play(sample())}>
          נגינת הקלטה לדוגמה
        </Button>

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
