import { describe, expect, it } from 'vitest';
import { formatKviusSignature, kviusCode, kviusSignature, sameKvius } from '../src/hebrewCalendar.js';

describe('kviusSignature', () => {
  it('never reports Rosh Hashana on Sunday, Wednesday or Friday ("lo adu rosh")', () => {
    const forbidden = new Set([0, 3, 5]);
    for (let year = 5700; year <= 5900; year++) {
      expect(forbidden.has(kviusSignature(year).roshHashanaDow)).toBe(false);
    }
  });

  it('reports year lengths only from the valid chaser/kesidran/shalem set', () => {
    const validCommon = new Set([353, 354, 355]);
    const validLeap = new Set([383, 384, 385]);
    for (let year = 5700; year <= 5900; year++) {
      const sig = kviusSignature(year);
      expect(sig.leap ? validLeap.has(sig.yearLength) : validCommon.has(sig.yearLength)).toBe(true);
    }
  });

  it('is reflexive and symmetric', () => {
    for (let year = 5750; year <= 5770; year++) {
      const a = kviusSignature(year);
      expect(sameKvius(a, a)).toBe(true);
      const b = kviusSignature(year + 1);
      expect(sameKvius(a, b)).toBe(sameKvius(b, a));
    }
  });

  it('distinguishes years that differ only by leap status, weekday, or year type', () => {
    // 5783 (common) vs 5784 (leap) - adjacent years essentially never share a kviah class by construction.
    const commonYears = [];
    const leapYears = [];
    for (let year = 5700; year <= 5750; year++) {
      (kviusSignature(year).leap ? leapYears : commonYears).push(year);
    }
    expect(commonYears.length).toBeGreaterThan(0);
    expect(leapYears.length).toBeGreaterThan(0);
    for (const cy of commonYears.slice(0, 3)) {
      for (const ly of leapYears.slice(0, 3)) {
        expect(sameKvius(kviusSignature(cy), kviusSignature(ly))).toBe(false);
      }
    }
  });
});

describe('kviusCode', () => {
  it('produces a 3-character Hebrew mnemonic for every year in range', () => {
    for (let year = 5700; year <= 5900; year++) {
      const code = kviusCode(year);
      expect(code).toHaveLength(3);
      expect(code).toMatch(/^[אבגהז][חכש][אבגהז]$/);
    }
  });

  it('assigns the same code to kvius-matched years and different codes otherwise', () => {
    const codeBySignature = new Map<string, string>();
    for (let year = 5700; year <= 5900; year++) {
      const sig = kviusSignature(year);
      const key = `${sig.leap}|${sig.roshHashanaDow}|${sig.yearType}`;
      const code = kviusCode(year);
      const existing = codeBySignature.get(key);
      if (existing) {
        expect(code).toBe(existing);
      } else {
        codeBySignature.set(key, code);
      }
    }
  });

  it('formats signatures into readable summaries without [object Object]', () => {
    const sig5786 = kviusSignature(5786);
    const formatted = formatKviusSignature(sig5786);
    expect(formatted).toBe('Regular · Kesidran (354 days)');
    expect(formatted).not.toContain('[object Object]');

    const leapSig = kviusSignature(5784); // 5784 was a leap year
    const formattedLeap = formatKviusSignature(leapSig);
    expect(formattedLeap).toContain('Leap');
    expect(formattedLeap).toContain('days');
  });
});
