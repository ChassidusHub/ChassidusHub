/**
 * mafteiach.app serves both listing and per-farbrengen-detail pages as a
 * JS snippet — `let html = "...."` followed by a DOM swap — rather than
 * plain HTML or JSON, presumably because the same partial is used for
 * both full-page loads and in-page AJAX swaps (a Rails `.js.erb`-style
 * partial). This extracts and unescapes that string literal back into
 * real HTML.
 *
 * The literal is a JS double-quoted string, escaped compatibly with JSON
 * (`\"`, `\/`, `\n`) except for two additions JSON doesn't understand:
 * escaped single quotes and backticks (left over from template literals
 * used elsewhere in the same generated source, e.g. the share() button's
 * onclick handler). Un-escaping just those two first makes the remainder
 * valid JSON, so `JSON.parse` does the rest of the unescaping correctly
 * (including \uXXXX sequences) rather than re-implementing it by hand.
 */
export function extractHtmlLiteral(js: string, varName = 'html'): string {
  const pattern = new RegExp(`let ${varName} = "([\\s\\S]*)"\\s*\\n\\s*window\\.setOuterHTMLWithScripts`);
  const match = js.match(pattern);
  if (!match) {
    throw new Error(`Could not locate a "let ${varName} = ...; window.setOuterHTMLWithScripts" literal in the response`);
  }
  const jsonCompatible = match[1]!.replace(/\\'/g, "'").replace(/\\`/g, '`');
  return JSON.parse(`"${jsonCompatible}"`) as string;
}
