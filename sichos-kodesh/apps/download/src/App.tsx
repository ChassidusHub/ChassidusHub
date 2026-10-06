import { useMemo } from 'react';
import { HDate } from '@hebcal/core';
import type { AppRelease, Meta, PrebuiltPack } from './api';
import { api } from './api';
import { yearsText } from './cart';
import { useI18n } from './i18n';
import { CartIcon, DownloadIcon, FolderIcon, OnwardIcon, PackageIcon, PhoneIcon, PlusIcon } from './icons';
import { formatMb, ltr, orderProfiles, profileInfo, yearLabel } from './selection';
import { Store } from './Store';
import type { Load } from './ui';
import { DownloadButton, useLoad } from './ui';

/** The site's version (package.json, through vite.config.ts). */
declare const __SITE_VERSION__: string;

/** The web version of the app. */
const WEB_APP_URL = 'https://sichoskodesh.vercel.app';
/** Where the app was before the app server had a release of its own: its links go there until the first one is published. */
const GITHUB_RELEASES_URL = 'https://github.com/shmuky/Sichos-Kodesh/releases/latest';

function LanguageToggle() {
  const { t, lang, setLang } = useI18n();
  const other = lang === 'he' ? 'en' : 'he';
  return (
    <button type="button" className="lang-toggle" lang={other} onClick={() => setLang(other)} aria-label={t.otherLangLabel}>
      {t.otherLang}
    </button>
  );
}

function Hero({ meta }: { meta: Load<Meta> }) {
  const { t, lang } = useI18n();
  const flow = [
    { icon: <PlusIcon size={22} />, label: t.flowAdd },
    { icon: <DownloadIcon size={22} />, label: t.flowDownload },
    { icon: <PhoneIcon size={22} />, label: t.flowPhone },
  ];
  const years = meta.state === 'ready' ? meta.value.years : [];
  return (
    <section className="hero">
      <p className="eyebrow">{t.heroEyebrow}</p>
      <h1 className="hero-title">{t.heroTitle}</h1>
      <p className="hero-lead">{t.heroLead}</p>
      <ol className="flow">
        {flow.map((step, index) => (
          <li key={step.label} className="flow-step">
            <span className="flow-well">{step.icon}</span>
            <span className="flow-label">{step.label}</span>
            {index < flow.length - 1 && (
              <span className="flow-onward" aria-hidden="true">
                <OnwardIcon size={16} />
              </span>
            )}
          </li>
        ))}
      </ol>
      {meta.state === 'ready' && (
        <ul className="facts" aria-label={t.factsLabel}>
          {/* Only what a person can take, each file once: never the encodings counted twice. */}
          {meta.value.files && meta.value.files.audio > 0 && <li>{t.recordings(meta.value.files.audio)}</li>}
          {meta.value.files && meta.value.files.pdf > 0 && <li>{t.pdfs(meta.value.files.pdf)}</li>}
          {meta.value.files && <li>{ltr(formatMb(meta.value.files.bytes))}</li>}
          <li>{years.length <= 3 ? t.yearsList(yearsText(years, lang)) : t.yearsSpan(years.length, yearLabel(years[0]!, lang), yearLabel(years[years.length - 1]!, lang))}</li>
          <li>{t.updated(lang === 'he' ? new HDate(new Date(meta.value.publishedAt)).renderGematriya(true) : new HDate(new Date(meta.value.publishedAt)).render('en'))}</li>
        </ul>
      )}
    </section>
  );
}

/** The prebuilt packs, one card to a month, each quality a row: the recommended one first. */
function ReadyPacks({ packs }: { packs: PrebuiltPack[] }) {
  const { t, lang } = useI18n();
  const groups = useMemo(() => {
    const byScope = new Map<string, PrebuiltPack[]>();
    for (const pack of packs) {
      const key = pack.scope.label.he;
      byScope.set(key, [...(byScope.get(key) ?? []), pack]);
    }
    return [...byScope.values()].map((list) => {
      const order = orderProfiles([...new Set(list.map((p) => p.profile))]);
      return { label: list[0]!.scope.label, packs: [...list].sort((a, b) => order.indexOf(a.profile) - order.indexOf(b.profile) || (a.part?.index ?? 0) - (b.part?.index ?? 0)) };
    });
  }, [packs]);

  if (groups.length === 0) return null;
  return (
    <div className="pack-grid">
      {groups.map((group) => (
        <article key={group.label.he} className="card pack-card">
          <header className="pack-card-head">
            <span className="pack-well">
              <PackageIcon size={20} />
            </span>
            <h3 className="pack-card-title">{group.label[lang]}</h3>
          </header>
          <ul className="rows">
            {group.packs.map((pack, index) => {
              const info = profileInfo(pack.profile, lang);
              return (
                <li key={pack.file} className="row">
                  <div className="row-text">
                    <span className="row-title">
                      {info.name}
                      {pack.part && pack.part.count > 1 && <span className="row-part"> · {t.partOf(pack.part.index + 1, pack.part.count)}</span>}
                      {index === 0 && group.packs.length > 1 && <span className="badge">{t.recommended}</span>}
                    </span>
                    <span className="row-note">
                      {ltr(formatMb(pack.bytes))} · {info.note}
                    </span>
                  </div>
                  <DownloadButton href={api.packUrl(pack.file)} file={pack.file} />
                </li>
              );
            })}
          </ul>
        </article>
      ))}
    </div>
  );
}

/** A link to the app's file for one ABI: the app server's, or the GitHub releases while the server has none published (latest.json fails). */
function appHref(release: Load<AppRelease>, abi: string): string {
  return release.state === 'error' ? GITHUB_RELEASES_URL : api.appDownloadUrl(abi);
}

/** The phone app itself, from the app server - the newest release, whichever it is. */
function AppDownload({ release }: { release: Load<AppRelease> }) {
  const { t } = useI18n();
  const file = (abi: string) => (release.state === 'ready' ? release.value.files.find((f) => f.abi === abi) : undefined);
  const main = file('arm64-v8a');
  return (
    <div className="card app-card">
      <span className="app-well" aria-hidden="true">
        <PhoneIcon size={24} />
      </span>
      <div className="app-text">
        <h3 className="app-title">{t.appTitle}</h3>
        <p className="app-note">
          {release.state === 'ready' ? t.appVersion(release.value.version) : t.appNewest}
          {main && <> · {ltr(formatMb(main.bytes))}</>}. {t.appNote}
        </p>
        <p className="app-alt">
          <a href={appHref(release, 'armeabi-v7a')}>{t.app32}</a> · <a href={appHref(release, 'universal')}>{t.appUniversal}</a>
        </p>
      </div>
      <DownloadButton href={appHref(release, 'arm64-v8a')} label={t.appDownload} />
    </div>
  );
}

function ImportSteps() {
  const { t } = useI18n();
  const icons = [<FolderIcon key="folder" size={20} />, <PackageIcon key="pack" size={20} />, <PhoneIcon key="phone" size={20} />];
  return (
    <>
      <ol className="import-steps">
        {t.importSteps.map((step, index) => (
          <li key={step.title} className="card import-step">
            <span className="import-number" aria-hidden="true">
              {index + 1}
            </span>
            <span className="import-icon">{icons[index]}</span>
            <h3 className="import-title">{step.title}</h3>
            <p className="import-body">{step.body}</p>
          </li>
        ))}
      </ol>
      <p className="tip">{t.importTip}</p>
    </>
  );
}

export function App() {
  const { t } = useI18n();
  const meta = useLoad<Meta>((signal) => api.meta(signal), []);
  const release = useLoad<AppRelease>((signal) => api.appRelease(signal), []);
  const packs = useLoad<PrebuiltPack[]>((signal) => api.packs(signal), []);

  return (
    <div className="page">
      <header className="top">
        <a className="brand" href="/">
          <span className="brand-mark">
            <PackageIcon size={18} />
          </span>
          <span className="brand-name">{t.brand}</span>
        </a>
        <nav className="top-links">
          <a className="top-site" href={WEB_APP_URL}>
            {t.navSite}
          </a>
          <a href="#app">{t.navApp}</a>
          <LanguageToggle />
          <a href="#cart" className="top-cart" aria-label={t.navCart}>
            <CartIcon size={18} />
          </a>
        </nav>
      </header>

      <main>
        <Hero meta={meta} />

        {meta.state === 'loading' && (
          <div className="card loading">
            <span className="spinner" aria-hidden="true" />
            {t.loadingShelves}
          </div>
        )}
        {meta.state === 'error' && <p className="card error">{t.serverDown(meta.message)}</p>}
        {meta.state === 'ready' && (
          <section className="section section-wide" aria-labelledby="store-title">
            <h2 id="store-title">{t.storeTitle}</h2>
            <p className="section-lead">{t.storeLead}</p>
            <Store meta={meta.value} />
          </section>
        )}

        {meta.state === 'ready' && packs.state === 'ready' && packs.value.some((p) => p.scope.kind !== 'work') && (
          <section className="section" aria-labelledby="ready-title">
            <h2 id="ready-title">{t.readyTitle}</h2>
            <p className="section-lead">{t.readyLead}</p>
            <ReadyPacks packs={packs.value.filter((p) => p.scope.kind !== 'work')} />
          </section>
        )}

        <section className="section" aria-labelledby="import-title" id="app">
          <h2 id="import-title">{t.importTitle}</h2>
          <AppDownload release={release} />
          <ImportSteps />
        </section>
      </main>

      <footer className="footer">
        <span className="footer-brand">{t.brand}</span>
        <span>{t.footerLine}</span>
        <span className="footer-links">
          <a href={appHref(release, 'arm64-v8a')}>{t.footerApp}</a>
          <a href={WEB_APP_URL}>{t.footerSite}</a>
          <span className="footer-version">{ltr(meta.state === 'ready' ? `site ${__SITE_VERSION__} · catalog ${meta.value.catalogVersion}` : `site ${__SITE_VERSION__}`)}</span>
        </span>
      </footer>
    </div>
  );
}
