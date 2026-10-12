- A suggestion sent twice is made once (#270). `POST /v1/suggestions` takes
  a `key` of the caller's own; the same author's same key answers the
  suggestion made then (200) instead of starting another. The MCP server's
  `suggest_items` takes it too: tried again, a call goes on with that
  suggestion, writes its new items over themselves, and once it was sent
  only answers its result.
- `POST /v1/suggestions/{id}/items` (`putSuggestionItems`) writes up to 500
  items into a draft in one go, all or none. `suggest_items` and
  `add_segments` use it, so a call of 200 items is a few statements instead
  of some 1,800 (600 items: 5,401 statements before, 18 now), and a big send
  no longer outlasts the 30 s a caller waits. A call now adds all its items
  or none.
