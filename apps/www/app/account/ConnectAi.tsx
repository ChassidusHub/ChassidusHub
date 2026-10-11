import { useState, type ReactNode } from 'react';
import { Button, Segmented, useToast } from '../ui';

/** The ChassidusHub MCP server: one address for every AI app. */
export const MCP_URL = 'https://api.chassidushub.org/mcp';

type App = 'claude' | 'chatgpt' | 'code' | 'other';

const APPS: { value: App; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'code', label: 'Claude Code' },
  { value: 'other', label: 'אחרת' },
];

const COMMAND = `claude mcp add --transport http chassidushub ${MCP_URL}`;

const STEPS: Record<App, ReactNode[]> = {
  claude: [
    <>פתחו את הגדרות ה-Connectors של Claude (הכפתור למטה), ובחרו <b>Add custom connector</b>.</>,
    <>בשם כתבו <b>ChassidusHub</b>, ובכתובת הדביקו את הכתובת שלמעלה. לחצו <b>Add</b>.</>,
    <>לחצו <b>Connect</b>, היכנסו ל-ChassidusHub ואשרו. זהו.</>,
  ],
  chatgpt: [
    <>ב-ChatGPT פתחו <b>Settings</b> ואז <b>Apps &amp; Connectors</b>. אם אין אפשרות להוסיף, הפעילו שם את <b>Developer mode</b> (תחת Advanced).</>,
    <>בחרו <b>Create</b>, כתבו את השם <b>ChassidusHub</b> והדביקו את הכתובת שלמעלה. בחיבור (Authentication) בחרו <b>OAuth</b>.</>,
    <>היכנסו ל-ChassidusHub כשתתבקשו ואשרו.</>,
  ],
  code: [
    <>
      הריצו בטרמינל את הפקודה הזאת: <bdi dir="ltr" className="code">{COMMAND}</bdi>
    </>,
    <>ב-Claude Code כתבו <bdi dir="ltr" className="code">/mcp</bdi> ובחרו את chassidushub כדי להתחבר לחשבון (צריך רק כדי לשלוח הצעות).</>,
  ],
  other: [
    <>בכל אפליקציה שמקבלת שרת MCP מרוחק (remote / HTTP): הוסיפו שרת בשם <b>ChassidusHub</b> עם הכתובת שלמעלה.</>,
    <>
      אם האפליקציה לא יודעת להתחבר עם OAuth, צרו מפתח API בדף החשבון ושלחו אותו ככותרת <bdi dir="ltr" className="code">Authorization: Bearer chp_…</bdi>
    </>,
  ],
};

const OPEN: Partial<Record<App, { label: string; href: string }>> = {
  claude: { label: 'פתיחת ההגדרות ב-Claude', href: 'https://claude.ai/settings/connectors' },
  chatgpt: { label: 'פתיחת ChatGPT', href: 'https://chatgpt.com/' },
};

/**
 * Connecting an AI app to ChassidusHub's MCP server, for anyone: one address
 * to copy, then the few steps of the app they use. Reading needs no account;
 * sending a fix asks them to sign in and say yes (the connect page).
 */
export function ConnectAi() {
  const [app, setApp] = useState<App>('claude');
  const toast = useToast();
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast('הועתק'),
      () => toast('לא הצלחנו להעתיק. סמנו והעתיקו ביד.'),
    );
  const open = OPEN[app];
  return (
    <>
      <div className="field">
        <label htmlFor="mcp-address">הכתובת להדבקה</label>
        <div className="copyline">
          <input id="mcp-address" readOnly value={MCP_URL} dir="ltr" onFocus={(e) => e.target.select()} />
          <Button small look="outline" icon="copy" onClick={() => void copy(MCP_URL)}>
            העתקה
          </Button>
        </div>
      </div>
      <Segmented label="באיזו אפליקציה אתם משתמשים?" value={app} onChange={setApp} options={APPS} />
      <ol className="howto">
        {STEPS[app].map((step, at) => (
          <li key={at}>{step}</li>
        ))}
      </ol>
      <div className="btns">
        {open && (
          <a className="btn small" href={open.href} target="_blank" rel="noreferrer">
            {open.label}
          </a>
        )}
        {app === 'code' && (
          <Button small look="outline" icon="copy" onClick={() => void copy(COMMAND)}>
            העתקת הפקודה
          </Button>
        )}
      </div>
      <p className="faint sm">קריאה וחיפוש עובדים בלי חשבון. רק שליחת תיקונים ודיווחים מבקשת להיכנס, וכל מה שנשלח נבדק כמו כל הצעה.</p>
    </>
  );
}
