- A name search writes the kinds it looks for into its statement, so every
  plan reads the small index of named items (migration 0042) and not the
  one over every item's words (#214).
