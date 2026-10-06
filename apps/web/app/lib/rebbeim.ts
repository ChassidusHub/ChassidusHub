/** The Rebbeim's shelves, the Rebbe's first, as people say their names; the other shelves follow in the catalog's order. */
export const REBBEIM: Array<{ slug: string; he: string; en: string; full: { he: string; en: string } | null }> = [
  { slug: 'the-rebbe', he: 'הרבי', en: 'The Rebbe', full: { he: 'רבי מנחם מענדל שניאורסאהן · ה׳תרס״ב–ה׳תשנ״ד', en: 'Rabbi Menachem Mendel Schneerson · 1902–1994' } },
  { slug: 'frierdiker-rebbe', he: 'הריי״צ', en: 'Frierdiker Rebbe', full: { he: 'רבי יוסף יצחק שניאורסאהן · ה׳תר״ם–ה׳תש״י', en: 'Rabbi Yosef Yitzchak Schneersohn · 1880–1950' } },
  { slug: 'rebbe-rashab', he: 'הרש״ב', en: 'Rebbe Rashab', full: { he: 'רבי שלום דובער שניאורסאהן · ה׳תרכ״א–ה׳תר״פ', en: 'Rabbi Shalom DovBer Schneersohn · 1860–1920' } },
  { slug: 'rebbe-maharash', he: 'מהר״ש', en: 'Rebbe Maharash', full: { he: 'רבי שמואל שניאורסאהן · ה׳תקצ״ד–ה׳תרמ״ג', en: 'Rabbi Shmuel Schneersohn · 1834–1882' } },
  { slug: 'tzemach-tzedek', he: 'הצמח צדק', en: 'Tzemach Tzedek', full: { he: 'רבי מנחם מענדל שניאורסאהן · ה׳תקמ״ט–ה׳תרכ״ו', en: 'Rabbi Menachem Mendel Schneersohn · 1789–1866' } },
  { slug: 'mitteler-rebbe', he: 'אדמו״ר האמצעי', en: 'Mitteler Rebbe', full: { he: 'רבי דובער שניאורי · ה׳תקל״ד–ה׳תקפ״ח', en: 'Rabbi DovBer Schneuri · 1773–1827' } },
  { slug: 'alter-rebbe', he: 'אדמו״ר הזקן', en: 'Alter Rebbe', full: { he: 'רבי שניאור זלמן מליאדי · ה׳תק״ה–ה׳תקע״ג', en: 'Rabbi Schneur Zalman of Liadi · 1745–1812' } },
  { slug: 'maggid', he: 'המגיד', en: 'The Maggid', full: { he: 'רבי דובער ממעזריטש · נסתלק ה׳תקל״ג', en: 'Rabbi DovBer of Mezritch · d. 1772' } },
  { slug: 'baal-shem-tov', he: 'הבעש״ט', en: 'Baal Shem Tov', full: { he: 'רבי ישראל בעל שם טוב · ה׳תנ״ח–ה׳תק״כ', en: 'Rabbi Yisroel Baal Shem Tov · 1698–1760' } },
];
