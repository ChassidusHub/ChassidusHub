import { Suspense, useEffect } from 'react';
import { Await, data, Link, redirect, useAsyncError, useNavigate } from 'react-router';
import { useAccount } from '../lib/account';
import { day, month, threadHref, type Profile } from '../people/talk';
import { Button, Say, TopBar } from '../ui';
import type { Route } from './+types/profile';

/**
 * A person's page, by their handle (/u/mendy), read on the server: it is the
 * same for everyone. An old handle leads to the new one for good (301), as
 * GitHub's renamed accounts do. That is why the read is waited for here, on
 * a first visit: the status must be right for a search engine.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  if (!/^[A-Za-z0-9-]{1,39}$/.test(params.username)) throw data('not found', { status: 404 });
  let profile: Profile;
  try {
    profile = (await context.api.getProfile({ username: params.username, limit: 40 })) as unknown as Profile;
  } catch (error) {
    if ((error as { status?: number }).status === 404) throw data('not found', { status: 404 });
    throw error;
  }
  if (profile.movedFrom || profile.person.username !== params.username) throw redirect(`/u/${profile.person.username}`, 301);
  return { username: params.username, data: Promise.resolve(profile) };
}

/** Opened from inside the site, the frame (the handle) is drawn at once; the person's page follows. */
export function clientLoader({ params, serverLoader }: Route.ClientLoaderArgs) {
  return { username: params.username, data: serverLoader().then((loaded) => loaded.data) };
}

export function headers() {
  return { 'Cache-Control': 'public, max-age=300, s-maxage=300' };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `@${loaderData.username} · ChassidusHub` : 'ChassidusHub' }];
}

/** What each kind of activity says before the conversation's name. */
const DID: Record<Profile['activity'][number]['kind'], string> = {
  suggestion: 'הציע',
  review: 'בדק את',
  issue: 'דיווח',
  comment: 'הגיב על',
};

/** The handle at once, as the top bar's title; the person's page where it will be, when it comes. */
export default function Screen({ loaderData }: Route.ComponentProps) {
  const frame = (
    <>
      <TopBar title={<bdi dir="ltr">@{loaderData.username}</bdi>} />
      <main id="content" className="view people">
        <p className="faint" aria-busy="true">
          רגע…
        </p>
      </main>
    </>
  );
  return (
    // Keyed by the handle, so going to another person shows their frame at once rather than this page until theirs has come.
    <Suspense key={loaderData.username} fallback={frame}>
      <Await resolve={loaderData.data} errorElement={<Elsewhere />}>
        {(profile) => <ProfilePage profile={profile} />}
      </Await>
    </Suspense>
  );
}

/**
 * When the page did not come from inside the site: an old handle goes on to
 * the new one, as the server would have sent it; no such person, or a
 * failure, is the site's own error page, as before.
 */
function Elsewhere() {
  const error = useAsyncError();
  const navigate = useNavigate();
  const to = error instanceof Response && error.status >= 300 && error.status < 400 ? error.headers.get('Location') : null;
  useEffect(() => {
    if (to) navigate(to, { replace: true });
  }, [to, navigate]);
  if (!to) throw error;
  return null;
}

/**
 * A person's public page (thread 6): who they are on ChassidusHub (steward,
 * trusted), how much they have done (fixes approved, reviews, reports), and
 * what they did lately, month by month. Nothing private shows: no email, no
 * private report. On their own page, a way to their account.
 */
function ProfilePage({ profile }: { profile: Profile }) {
  const { person, counts, activity } = profile;
  const account = useAccount();
  const mine = account?.person.id === person.id;
  const months: { month: string; items: Profile['activity'] }[] = [];
  for (const item of activity) {
    const name = month(item.at);
    const last = months[months.length - 1];
    if (last?.month === name) last.items.push(item);
    else months.push({ month: name, items: [item] });
  }
  return (
    <>
      <TopBar title={person.displayName} />
      <main id="content" className="view people">
        <div className="phead">
          <div>
            <h1>
              <bdi>{person.displayName}</bdi>
            </h1>
            <p className="faint sm">
              <bdi dir="ltr">@{person.username}</bdi> · באתר מאז {day(person.since)}
            </p>
          </div>
          {mine && (
            <Button small look="outline" icon="pen" to="/account">
              החשבון שלי
            </Button>
          )}
        </div>
        {(person.admin || person.steward || person.trust === 'trusted') && (
          <p className="pmeta">
            {person.admin ? <span className="tag">מנהל האתר</span> : person.steward ? <span className="tag">שומר האתר</span> : null}
            {person.trust === 'trusted' && <span className="tag">אמין</span>}
          </p>
        )}
        {person.suspended && <Say tone="bad">החשבון הזה מושעה.</Say>}

        <nav className="stats" aria-label="מה עשה">
          <Link to={`/suggestions?author=${encodeURIComponent(person.username)}&state=closed`}>
            <b>{counts.merged}</b>
            <span>תיקונים שאושרו</span>
          </Link>
          <Link to={`/suggestions?reviewer=${encodeURIComponent(person.username)}&state=closed`}>
            <b>{counts.reviews}</b>
            <span>בדיקות</span>
          </Link>
          <Link to={`/issues?author=${encodeURIComponent(person.username)}`}>
            <b>{counts.issues}</b>
            <span>דיווחים</span>
          </Link>
        </nav>

        <h2>פעילות אחרונה</h2>
        {activity.length === 0 ? (
          <p className="faint">עוד אין פעילות.</p>
        ) : (
          months.map((group) => (
            <section key={group.month} aria-label={group.month}>
              <h3 className="month">{group.month}</h3>
              <ul className="threads">
                {group.items.map((item, at) => {
                  const { thread } = item;
                  const to = threadHref(thread.kind, thread.number, thread.id, thread.path);
                  const title = (
                    <>
                      <span className="faint">{DID[item.kind]} </span>
                      <bdi>{thread.title ?? thread.path ?? thread.id}</bdi>
                      {thread.number ? <span className="faint"> #{thread.number}</span> : null}
                    </>
                  );
                  const inside = (
                    <span className="t">
                      <b dir="auto">{title}</b>
                      <span>
                        {item.excerpt ? <bdi>{item.excerpt}</bdi> : null}
                        {item.excerpt ? ' · ' : ''}
                        {day(item.at)}
                      </span>
                    </span>
                  );
                  return (
                    <li key={at}>
                      {to ? (
                        <Link to={to} className="thread">
                          {inside}
                        </Link>
                      ) : (
                        <div className="thread">{inside}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </main>
    </>
  );
}
