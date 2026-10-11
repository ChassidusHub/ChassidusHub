/**
 * The sichos whose lead (migration 0033) holds the words, found through an
 * index. A common word is in most sichos, so the search found the first
 * forty that held it by reading each one's whole words in turn (some 80 KB
 * a sicha); through the lead's index it finds those that open on the words
 * reading only the index, and ranks them on their lead (#182).
 *
 * Built on unit_place, never entity: building it holds back writes to
 * unit_place for the moment it takes (69,000 small rows), never reads.
 */
export const up = /* sql */ `
CREATE INDEX unit_place_lead ON unit_place USING gin (lead);
`;
