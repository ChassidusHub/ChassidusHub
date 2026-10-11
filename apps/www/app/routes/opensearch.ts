import { escapeXml, fileResponse, siteOf } from '../lib/site';
import type { Route } from './+types/opensearch';

/** ChassidusHub as a search engine of the browser's own (OpenSearch 1.1): the address bar searches the catalog. root.tsx links it from every page. */
export function openSearchXml(origin: string): string {
  const base = escapeXml(origin);
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/" xmlns:moz="http://www.mozilla.org/2006/browser/search/">
  <ShortName>ChassidusHub</ShortName>
  <Description>חיפוש במפתח הפתוח לתורת חב״ד ולהקלטותיה</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image type="image/svg+xml">${base}/favicon.svg</Image>
  <Url type="text/html" method="get" template="${base}/search?q={searchTerms}"/>
  <Url type="application/opensearchdescription+xml" rel="self" template="${base}/opensearch.xml"/>
  <moz:SearchForm>${base}/search</moz:SearchForm>
</OpenSearchDescription>
`;
}

export function loader({ request }: Route.LoaderArgs) {
  return fileResponse(openSearchXml(siteOf(request).origin), 'application/opensearchdescription+xml', 86400);
}
