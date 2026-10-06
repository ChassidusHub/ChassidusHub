import { typedIsRtl } from './rtl';

describe('typedIsRtl', () => {
  it('keeps the interface direction while a box has no letters', () => {
    expect(typedIsRtl('', true)).toBe(true);
    expect(typedIsRtl('', false)).toBe(false);
    expect(typedIsRtl('5736 ', false)).toBe(false);
  });

  it('follows the first letter typed', () => {
    expect(typedIsRtl('Vayakhel', true)).toBe(false);
    expect(typedIsRtl('ויקהל', false)).toBe(true);
    expect(typedIsRtl('5736 שבט', false)).toBe(true);
    expect(typedIsRtl('"Tanya" תניא', true)).toBe(false);
  });
});
