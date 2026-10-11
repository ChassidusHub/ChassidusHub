import { ConnectAi } from '../account/ConnectAi';
import { TopBar } from '../ui';
import type { Route } from './+types/connect';

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'ChassidusHub בתוך Claude ו-ChatGPT' },
    { name: 'description', content: 'איך מחברים את ChassidusHub ל-Claude, ל-ChatGPT ול-Claude Code: מעתיקים כתובת אחת ומאשרים.' },
  ];
}

/** The same for everyone: nothing is read from the catalog. */
export function headers() {
  return { 'Cache-Control': 'public, max-age=3600' };
}

/**
 * Using ChassidusHub inside an AI app (thread 6): connecting Claude,
 * ChatGPT or another app to the MCP server in a minute, for anyone, with no
 * account. The page to share; the account page shows the apps connected.
 */
export default function Screen() {
  return (
    <>
      <TopBar title="חיבור ל-AI" />
      <main id="content" className="view">
        <div className="auth">
          <h1>ChassidusHub בתוך Claude ו-ChatGPT</h1>
          <p className="lede">חברו את ChassidusHub לאפליקציית ה-AI שלכם, ושאלו אותה על כל שיחה, מאמר, התוועדות והקלטה. היא תחפש, תקרא ותביא קישורים מהקטלוג. לוקח דקה.</p>
          <ConnectAi />
        </div>
      </main>
    </>
  );
}
