# The site's fonts

Subsets in woff2, each with only the letters the site sets in it, so a page
starts with one small font (the UI face, preloaded) and fetches the others
only when a page uses them.

| File | Face | Used for | Licence |
| --- | --- | --- | --- |
| noto-sans-hebrew.woff2 | Noto Sans Hebrew, variable 400-600 | everything but titles and Torah text; preloaded | SIL OFL 1.1 (NotoSans-OFL.txt) |
| frank-ruhl-libre-500.woff2 | Frank Ruhl Libre 500 | titles | SIL OFL 1.1 (FrankRuhlLibre-OFL.txt) |
| frank-ruehl-clm.woff2, frank-ruehl-clm-bold.woff2 | Frank Ruehl CLM Medium and Bold (Culmus 0.140) | Torah text, Hebrew letters and points only | GPL-2.0 with the font exception (Culmus-LICENSE.txt, Culmus-GNU-GPL.txt) |

Made with fontTools: Noto Sans Hebrew and Frank Ruhl Libre from Google Fonts
(Basic Latin, Hebrew letters and points, Hebrew punctuation, dashes, quotes,
×, ·, …, ₪), cut to the weights the site uses with `fonttools varLib.instancer`;
Frank Ruehl CLM from Culmus with `pyftsubset` (digits and punctuation, Hebrew
U+0591-05C7, U+05D0-05EA, U+05F0-05F4; Latin falls back to the UI face).
