import { data, Link, redirect } from 'react-router';
import { useAccount } from '../lib/account';
import { day, month, threadHref, type Profile } from '../people/talk';
import { Button, Say, TopBar } from '../ui';
import type { Route } from './+types/profile';

/**
 * A person's page, by their handle (/u/mendy), read on the server: it is the
 * same for everyone. An old handle leads to the new one for good (301), as
 * GitHub's renamed accounts do.
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
  return profile;
}

export function headers() {
  return { 'Cache-Control': 'public, max-age=300, s-maxage=300' };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const person = loaderData?.person;
  return [{ title: person ? `${person.displayName} (@${person.username}) · ChassidusHub` : 'ChassidusHub' }];
}

/** What each kind of activity says before the conversation's name. */
const DID: Record<Profile['activity'][number]['kind'], string> = {
  suggestion: 'הציע',
  review: 'בדק את',
  issue: 'דיווח',
  comment: 'הגיב על',
};

/**
 * A person's public page (thread 6): who they are on ChassidusHub (steward,
 * trusted), how much they have done (fixes approved, reviews, reports), and
 * what they did lately, month by month. Nothing private shows: no email, no
 * private report. On their own page, a way to their account.
 */
export default function ProfilePage({ loaderData: profile }: Route.ComponentProps) {
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
