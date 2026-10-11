# RFC 0002: A sefer's own place in each set it sits in

- Status: proposed
- Issue: #78
- Author (lane or person): Data lane
- Date: 2026-10-11

## Problem

An item has one `order` key, and every list it appears in sorts by that key.
A sefer that sits in two sets (`sets: [a, b]`, such as Likkutei Sichos on the
Rebbe's shelf and in a Kehot series) therefore has the same place in both
lists. When a keeper puts it first in one set, it moves in the other set too.
Sets in the fixed tree each have their own printed order (the official Kehot
sets, a Rebbe's main sefarim), so a keeper ordering one set should not
reorder another.

Today `organize`'s `reorder` and `move` write `data.order`. The lists that
sort a set's items by it are `catalog.list({ set })`, the tree
(`catalogTree`), the path bar's neighbours and the linked pages (`linked.ts`).

## Proposal

Each item may carry its place in a particular set, beside its one `order`:

```jsonc
{ "sets": ["rh-a", "rh-b"], "order": "a0", "orderIn": { "rh-b": "c4" } }
```

- **Reading.** A set's list sorts by `coalesce(orderIn[set], order)`. An item
  with no `orderIn` keeps sorting exactly as now, so nothing on live moves
  when this ships.
- **Writing (organize).** Reordering, or moving an item into a set, writes
  `orderIn[set]` when the item sits in more than one set. It writes `order`
  as now when the item sits in only one. Moving an item out of a set drops
  that set's key, and a merge keeps the kept item's keys. A key for a set the
  item is not in fails the suggestion's checks, like a `sets` entry that
  points at nothing. A sicha's place in its sefer (`work`) and a set's place
  under its `parent` stay on `order`: each has only one parent.
- **Schema.** `orderIn` becomes a common optional field (an object of order
  keys by set id) in the built-in schemas, with BUILTIN_SCHEMA_VERSION bumped.
  The order keys inside it count as references to sets, so `entity_ref` keeps
  them (field `orderIn`) and a set's deletion check sees them.
- **No migration.** The field lives in each revision's JSON. Sorting
  computes `coalesce` over a set's members, a few hundred rows at most, so it
  needs no index.
- **API.** Lists already come back in order. `GET /v1/entities/:id` shows
  `orderIn` as part of the data. The MCP `reorder_children` takes the set it
  orders as its `parent`, as it does today.

It ships as one PR on the Data lane: schema, organize, the list queries, and
tests in which a sefer in two sets is reordered in one while the other keeps
its order.

## Cost and risk

The PR is about one day of Data lane work. It costs nothing to run, needs no
migration, and needs nothing from Shmuly. The risk is a list that sorts by
`order` without the set's key. The tests cover each list named above, and a
missed list only shows the old shared order, so nothing breaks. Undoing it
means a revert, after which any `orderIn` keys written in the meantime are
ignored.

## Alternatives

- **An order table (`set_member(set_id, item_id, order)`).** Order then
  lives outside the versioned data, so suggestions, history and merges would
  not cover it. It would also need a migration.
- **Only the "home" set has an order and the others list by name.** Simpler,
  but the official sets in the fixed tree each have their own printed order,
  which this would lose.
- **Doing nothing.** Keepers of one set keep reordering another set without
  knowing it.
