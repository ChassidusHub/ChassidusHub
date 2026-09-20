export {};

const identity = require('./pdfIdentity') as typeof import('./pdfIdentity');

describe('pdfIdentity', () => {
  it('creates a stable progress key from route/catalog identity', () => {
    expect(
      identity.createPdfProgressKey(
        identity.pdfIdentityFromRoute({
          hebrewYear: 5711,
          occasionId: 3,
          driveFileId: 'drive-file',
          resourceKey: 'resource-key',
          label: 'PDF title',
        }),
      ),
    ).toBe('pdf:5711:3:drive-file');
  });

  it('returns null for invalid route identities', () => {
    expect(
      identity.pdfIdentityFromRoute({
        hebrewYear: 5711,
        occasionId: 0,
        driveFileId: '',
        resourceKey: null,
        label: 'Broken',
      }),
    ).toBeNull();
  });

  it('normalizes saved pages and clamps them to total pages', () => {
    expect(identity.resolveInitialPdfPage(undefined)).toBe(1);
    expect(identity.resolveInitialPdfPage(-4)).toBe(1);
    expect(identity.resolveInitialPdfPage(4.9)).toBe(4);
    expect(identity.resolveInitialPdfPage(99, 12)).toBe(12);
  });
});
