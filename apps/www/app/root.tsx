import { useEffect } from 'react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse } from 'react-router';
import type { Route } from './+types/root';
import { CATALOG_INDEX, useServerOnly } from './serverOnly';
import { ToastProvider } from './ui';
import uiFont from './ui/fonts/noto-sans-hebrew.woff2?url';
import uiCss from './ui/ui.css?url';

/**
 * Only the UI face is fetched before the first paint; the title and Torah
 * faces come when a page uses them (ui/fonts/README.md).
 */
export const links: Route.LinksFunction = () => [
  { rel: 'preload', href: uiFont, as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
  { rel: 'stylesheet', href: uiCss },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
];

/**
 * When this browser has somewhere to continue (the cookies of
 * listen/stopped.ts, LISTEN_COOKIE and READ_COOKIE), marks <html>
 * `data-resume="listen read"`. Pages are kept at the edge for everyone alike
 * (server/edge.ts), so Home's and Listen's "continue" is drawn in the
 * browser after the page loads; the marks keep its place open from the first
 * paint (ui.css, .resume), so nothing moves when it comes. Written out here,
 * not imported, so the first page loads no script more for it.
 */
const RESUME_SCRIPT = `var c=document.cookie,r=[];if(/(?:^|;\\s*)ch_listen=/.test(c))r.push('listen');if(/(?:^|;\\s*)ch_read=/.test(c))r.push('read');if(r.length)d.dataset.resume=r.join(' ');`;

/**
 * A tap that comes before the page's scripts (2 to 3 s in on a slow phone)
 * is kept, not lost, and made for the person once the page has come to life
 * (App, below). A link tapped shows the next page's frame at once (#322):
 * its title, from the link, over a quiet stand-in for what comes under it
 * (ui.css, .first-frame), with its address in the address bar; the page then
 * opens in the browser, from the catalog it keeps, rather than as a whole
 * new page over a slow line. The address is put back just before the
 * scripts take over the page (when React Router names its route modules),
 * so they come to life on the page that was drawn, and the frame goes once
 * the tapped page is there. A button or footnote mark tapped shows it is
 * waiting (ui.css, [data-wait]); a footnote mark's no-script link to the note
 * at the end of the page is held, so the reader keeps their place and the
 * note opens where they are. Forms go through as they are. Only the last tap
 * is kept, and taps still waiting in the browser while the page came to life
 * count as that same tap (so a second tap never closes what the first
 * opened). If the page has loaded and its scripts still have not come to
 * life 5 s later (one failed), the link is followed after all.
 * Words selected before the scripts come (a long press on a slow phone) get
 * the bar Fixing draws over them (#345): the same buttons in the same place
 * (34 px under the words on a touch screen, clear of the handles), held like
 * any button until the page comes to life, when Fixing's own bar takes its
 * place and a button tapped on it is made on Fixing's.
 * Written out here, not imported, so it runs before any script arrives.
 */
const EARLY_TAPS = import.meta.env.SSR
  ? `(function(){var w=window,d=document,h=history,q=null,o=null,f=null,u=0,R='__reactRouterRouteModules';` +
    // The next page's frame, drawn over this page's column under its top bar.
    `function frame(t){if(!f){f=d.createElement('div');f.className='first-frame';f.setAttribute('aria-busy','true');f.innerHTML='<div class="view"><h1></h1><p class="ff-line"></p><p class="ff-line"></p><p class="ff-line ff-short"></p></div>';var m=d.querySelector('.main'),b=d.querySelector('header'),r=m&&m.getBoundingClientRect();if(r){f.style.left=r.left+'px';f.style.width=r.width+'px'}f.style.top=(b?Math.max(0,b.getBoundingClientRect().bottom):0)+'px';d.body.appendChild(f)}f.querySelector('h1').textContent=(t.querySelector('b')||t).textContent.trim()}` +
    `function back(){if(o){h.replaceState(o.s,'',o.u);o=null}}` +
    `function drop(){back();if(f){f.remove();f=null}}` +
    `function k(e){var t=e.target&&e.target.closest&&e.target.closest('a[href],button');if(!t||t.disabled||(t.type==='submit'&&t.form))return;` +
    `if(t.tagName==='A'&&!t.matches('.nm')){if(e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||t.target||t.hasAttribute('download')||t.origin!==location.origin||(t.pathname===location.pathname&&t.hash))return;frame(t);if(!u){o=o||{u:location.href,s:h.state};h.replaceState(null,'',t.href)}}else drop();` +
    `e.preventDefault();e.stopPropagation();if(q&&q!==t)q.removeAttribute('data-wait');q=t;t.setAttribute('data-wait','');var n=0,i=setInterval(function(){if(q!==t)return clearInterval(i);if(document.readyState==='complete'&&++n>5&&t.href){clearInterval(i);q=null;t.removeAttribute('data-wait');location.href=t.href}},1000)}` +
    `w.addEventListener('click',k,true);w.addEventListener('pageshow',function(e){if(e.persisted)drop()});` +
    // The bar over selected words in a page that takes fixes ([data-fix-item]), as Fixing draws it (34 is its HANDLES).
    `var g=null;function bar(){var s=getSelection(),r=s&&s.rangeCount?s.getRangeAt(0):null,c=r&&!r.collapsed&&r.commonAncestorContainer,e=c&&(c.nodeType===1?c:c.parentElement);` +
    `if(!e||!e.closest('[data-fix-item]')||!r.toString().trim()){if(g){g.remove();g=null}return}` +
    `if(!g){var i=d.querySelector('use[href*="#i-"]'),p=i?i.getAttribute('href').split('#')[0]:'';g=d.createElement('div');g.className='pop';g.setAttribute('role','toolbar');g.setAttribute('aria-label','\u05d4\u05de\u05d9\u05dc\u05d9\u05dd \u05e9\u05e1\u05d5\u05de\u05e0\u05d5');g.dataset.early='';` +
    `g.innerHTML=[['pen','\u05ea\u05e7\u05df'],['copy','\u05d4\u05e2\u05ea\u05e7 \u05e2\u05dd \u05de\u05e7\u05d5\u05e8'],['share','\u05e9\u05ea\u05e3']].map(function(b){return '<button type="button"><svg class="i s" viewBox="0 0 24 24" aria-hidden="true"><use href="'+p+'#i-'+b[0]+'"/></svg>'+b[1]+'</button>'}).join('');` +
    `g.addEventListener('pointerdown',function(e){e.preventDefault()});d.body.appendChild(g)}` +
    `var x=r.getBoundingClientRect(),W=g.offsetWidth,H=g.offsetHeight,o2=matchMedia('(pointer: coarse)').matches,un=o2||x.top-H-10<60;` +
    `g.style.left=Math.max(8,Math.min(innerWidth-W-8,x.left+x.width/2-W/2))+'px';g.style.top=(un?Math.min(x.bottom+(o2?34:10),innerHeight-H-8):x.top-H-10)+'px'}` +
    `d.addEventListener('selectionchange',bar);w.addEventListener('scroll',bar,{passive:true});` +
    // Fixing's bar comes a frame or two after the page comes to life: the early one stays until then, and a button
    // tapped on it is made on Fixing's, found by its words.
    `function hand(t){d.removeEventListener('selectionchange',bar);w.removeEventListener('scroll',bar);if(!g)return;var e=g,n=0,l=t&&e.contains(t)&&t.textContent;g=null;` +
    `(function wait(){var b=d.querySelector('.pop:not([data-early])');if(b||++n>60){e.remove();if(b&&l)[].forEach.call(b.querySelectorAll('button'),function(x){if(x.textContent===l)x.click()});return}requestAnimationFrame(wait)})()}` +
    // React Router names its route modules just before it hydrates: the address drawn goes back first.
    `Object.defineProperty(w,R,{configurable:true,set:function(v){u=1;back();delete w[R];w[R]=v}});` +
    `w.__taps=function(){setTimeout(function(){w.removeEventListener('click',k,true);var t=q;q=null;if(t)t.removeAttribute('data-wait');var y=g&&t&&g.contains(t);hand(t);if(t&&!y&&t.isConnected)t.click();` +
    `if(f){var a=location.pathname,p=t&&t.pathname,s=0,n=0,i=setInterval(function(){if(location.pathname!==a||p===a)s++;if(s>2||++n>200||!p){clearInterval(i);drop()}},50)}})}})()`
  : '';

/** The service worker (public/sw.js), once the page has loaded, so it never competes with the page itself. */
const worker = import.meta.env.SSR ? `if('serviceWorker'in navigator)addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})` : '';

/**
 * A reader's light or dark choice and text size (kept in this browser), set
 * before the page paints so it never flashes the other one or jumps to
 * another size. With no choice the system's theme wins. Then whether there
 * is somewhere to continue (RESUME_SCRIPT).
 */
const theme = import.meta.env.SSR ? `try{var d=document.documentElement,t=localStorage.getItem('theme'),s=localStorage.getItem('size');if(t==='light'||t==='dark')d.dataset.theme=t;if(/^(-[12]|[0-5])$/.test(s))d.style.setProperty('--torah-step',s);${RESUME_SCRIPT}}catch(e){}` : '';

/**
 * The whole site is Hebrew and right to left from the first byte, so nothing
 * flips after load. Play controls and progress bars set their own direction.
 */
export function Layout({ children }: { children: React.ReactNode }) {
  // The catalog snapshot's index, so the browser reads the catalog with no wait for it (#265, app/catalog/browser.ts).
  // Only the server writes it; hydration keeps what was drawn.
  const catalogIndex = useServerOnly(CATALOG_INDEX) ?? '';
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="search" type="application/opensearchdescription+xml" title="ChassidusHub" href="/opensearch.xml" />
        {/* These run from the HTML, before any script file comes. Only the server writes their words
            (import.meta.env.SSR): the browser's bundle leaves them out, and hydration keeps what was drawn. */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: theme }} />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: EARLY_TAPS }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <script type="application/json" id={CATALOG_INDEX} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: catalogIndex }} />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: worker }} />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  // The page has come to life: a tap kept since its first paint (EARLY_TAPS) is made now.
  useEffect(() => (window as { __taps?: () => void }).__taps?.(), []);
  return (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="view">
      <h1>{missing ? 'הדף לא נמצא' : 'משהו השתבש'}</h1>
      <p>
        <a href="/">לדף הבית</a>
      </p>
    </main>
  );
}
