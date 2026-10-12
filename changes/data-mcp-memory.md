- `POST /v1/suggestions/{id}/items` takes `set` in place of `data` for an
  existing item: only those fields change (null removes one), merged onto the
  item as the suggestion sees it, so its words are never sent. The MCP
  server's `suggest_items` sends `set` this way, rather than reading each
  item whole and sending it back (four big batches ran the Worker out of
  memory, #325). Each MCP tool call now logs its name and time.
