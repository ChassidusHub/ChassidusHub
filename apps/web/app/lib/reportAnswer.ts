/** What the API answered a report sent without an account: the number it got as an issue, or why it was not taken. */
export type SignedOutReport = { number: number | null } | { error: string };

/**
 * Where a signed-out reader goes once their report is in: to the issue it became, so they see it
 * among the others. Not for a private kind (rights, offensive): the issue page hides a private
 * report from anyone not signed in, so it would read as if the report never arrived. They are
 * thanked on the form instead, as when the API gives no number.
 */
export function issueAfterReport(answer: SignedOutReport | undefined, privateKind: boolean): number | 'thanks' | null {
  if (!answer || 'error' in answer) return null;
  return answer.number === null || privateKind ? 'thanks' : answer.number;
}
