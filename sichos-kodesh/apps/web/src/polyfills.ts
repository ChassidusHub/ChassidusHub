/**
 * `Map.prototype.getOrInsertComputed` (and `.getOrInsert`) were only very
 * recently standardized (TC39 "Map/Set upsert") - real browsers still in
 * everyday use (not just old ones; this gap shows up on current Safari and
 * many Android WebViews too) don't have them yet. pdfjs-dist (every current
 * version, not just this one - see pdf/renderPdf.ts's comment) calls
 * `getOrInsertComputed` internally with no fallback, so on a browser
 * without it `page.render()` throws mid-render and the PDF viewer shows a
 * blank canvas instead of the page - a real, observed bug, not a
 * theoretical one. The spec's own semantics are simple enough to polyfill
 * exactly, so this must run before anything touches pdf.js.
 */
if (!Map.prototype.getOrInsertComputed) {
  Map.prototype.getOrInsertComputed = function <K, V>(this: Map<K, V>, key: K, callbackfn: (key: K) => V): V {
    if (!this.has(key)) this.set(key, callbackfn(key));
    return this.get(key) as V;
  };
}

if (!Map.prototype.getOrInsert) {
  Map.prototype.getOrInsert = function <K, V>(this: Map<K, V>, key: K, value: V): V {
    if (!this.has(key)) this.set(key, value);
    return this.get(key) as V;
  };
}

declare global {
  interface Map<K, V> {
    getOrInsertComputed(key: K, callbackfn: (key: K) => V): V;
    getOrInsert(key: K, value: V): V;
  }
}
