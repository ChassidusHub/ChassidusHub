import { describe, expect, it } from 'vitest';
import { issueAfterReport } from '../app/lib/reportAnswer.js';

/** A report sent without an account: where the reader is taken once it is in (#139). */
describe('issueAfterReport', () => {
  it('opens the issue a public report became', () => {
    expect(issueAfterReport({ number: 42 }, false)).toBe(42);
  });

  it('thanks the reader for a private one, which its issue page would hide from them', () => {
    expect(issueAfterReport({ number: 42 }, true)).toBe('thanks');
  });

  it('thanks the reader when the API gives no number', () => {
    expect(issueAfterReport({ number: null }, false)).toBe('thanks');
  });

  it('goes nowhere before an answer, or when the report was not taken', () => {
    expect(issueAfterReport(undefined, false)).toBeNull();
    expect(issueAfterReport({ error: 'too many reports' }, true)).toBeNull();
  });
});
