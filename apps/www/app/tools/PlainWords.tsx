import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** A web address, an item's id, a site path, @someone or #12, in that order of trying. */
const LINKS = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"״׳])|(?<!\w)(rh-[a-z0-9]{6,})(?![\w-])|(?<![\w/])(\/[a-z0-9][\w\-/]*[\w])(?![\w])|(?<![\w@])@([a-z0-9][\w-]{1,38})|(?<![\w#&])#(\d{1,7})(?!\d)/gi;

/**
 * A comment's words as they were written, plain: no markup is read. Web
 * addresses, item ids, site paths, @people and #numbers in them become
 * links; line breaks stay.
 */
export function PlainWords({ text }: { text: string }) {
  return (
    <div className="it-words">
      {text.split(/\n{2,}/).map((paragraph, at) => (
        <p key={at}>{linked(paragraph)}</p>
      ))}
    </div>
  );
}

function linked(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINKS)) {
    const at = match.index ?? 0;
    if (at > last) out.push(...lines(text.slice(last, at), out.length));
    const [whole, url, id, path, person, number] = match;
    const key = `l${out.length}`;
    if (url)
      out.push(
        <a key={key} href={url} rel="nofollow noopener" target="_blank" dir="ltr">
          {url}
        </a>,
      );
    else if (id) out.push(<Link key={key} to={`/${id}`} dir="ltr">{id}</Link>);
    else if (path) out.push(<Link key={key} to={path} dir="ltr">{path}</Link>);
    else if (person) out.push(<Link key={key} to={`/u/${person}`} dir="ltr">@{person}</Link>);
    else if (number) out.push(<Link key={key} to={`/suggestions/${number}`} dir="ltr">#{number}</Link>);
    else out.push(whole);
    last = at + whole.length;
  }
  if (last < text.length) out.push(...lines(text.slice(last), out.length));
  return out;
}

/** Plain words with their single line breaks kept. */
function lines(text: string, from: number): ReactNode[] {
  return text.split('\n').flatMap((line, at) => (at ? [<br key={`b${from}-${at}`} />, line] : [line]));
}
