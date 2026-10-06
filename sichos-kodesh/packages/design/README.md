# @sichos-kodesh/design

The design tokens every Sichos Kodesh surface shares: the phone app, the web
app and pack.sk. One source for the colors, the type scale, spacing, corners
and motion, so a screen is designed once.

- **Colors** (`colors.ts`): fixed neutrals per scheme (warm paper in light,
  ink in dark) and the **theme color presets** people choose from in
  Settings - green (the default), blue, burgundy, teal, gold and purple, each
  tuned for light and dark. `themeColors(scheme, presetId)` gives the phone
  its colors object; the keys match `apps/mobile/src/ui/theme.tsx`.
- **CSS** (`css.ts`): `themeStylesheet()` writes the same colors as the web's
  CSS variables (`--bg`, `--accent-soft`...). The system scheme applies unless
  `data-theme` on the root says otherwise; `data-accent` picks a preset.
- **Scales** (`scale.ts`): fonts, the type scale, spacing in steps of 4,
  corner radii, motion durations and the smallest touch target.

The tests keep every preset readable in both schemes: the accent at 4.5:1 or
more against the page, cards and its own tint, text on a filled accent at
4.5:1, and text on the tint at 7:1.
