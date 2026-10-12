- Migration 0038: a suggestion can carry a client key (`changeset.client_key`,
  unique per author), so a caller that sends the same suggestion twice can
  find the first instead of making a second (#270). Nothing uses it yet;
  the API change follows in its own PR.
