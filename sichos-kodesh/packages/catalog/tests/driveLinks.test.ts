import { describe, expect, it } from 'vitest';
import { extractDriveFileId, extractDriveResourceKey, isReshimosLabel } from '../src/driveLinks.js';

describe('extractDriveFileId', () => {
  it('extracts the file id from a real share-link shape (view, sharing param)', () => {
    expect(extractDriveFileId('https://drive.google.com/file/d/1KF7cbUcsjkEQvfs5bFzhRNbTVBevhUBe/view?usp=sharing')).toBe(
      '1KF7cbUcsjkEQvfs5bFzhRNbTVBevhUBe',
    );
  });

  it('extracts the file id regardless of the trailing query param', () => {
    expect(extractDriveFileId('https://drive.google.com/file/d/1db9QCEC2tRxCyelbYRqT3UQfoJ9hpgkz/view?usp=share_link')).toBe(
      '1db9QCEC2tRxCyelbYRqT3UQfoJ9hpgkz',
    );
  });

  it('extracts the file id from the open?id= shape - the majority shape in the real dataset (52%), previously dropped entirely', () => {
    expect(extractDriveFileId('https://drive.google.com/open?id=1NkOtSSm6fTmFXTfE48ORLrygLfwBC5Wu')).toBe(
      '1NkOtSSm6fTmFXTfE48ORLrygLfwBC5Wu',
    );
  });

  it('extracts the file id from the uc?...&id= download-link shape', () => {
    expect(extractDriveFileId('https://drive.google.com/uc?export=download&id=1abcDEF23456')).toBe('1abcDEF23456');
  });

  it('returns null for a non-Drive URL, even one with an id= query param', () => {
    expect(extractDriveFileId('https://www.sie.org/templates/sie/article_cdo/aid/2328350/jewish/x.htm')).toBeNull();
    expect(extractDriveFileId('https://docs.google.com/document/d/1abc/edit?id=1abc')).toBeNull();
  });

  it('returns null for a Drive URL that is neither share shape (e.g. a folder link)', () => {
    expect(extractDriveFileId('https://drive.google.com/drive/folders/1abc')).toBeNull();
  });

  it('returns null for a malformed URL rather than throwing', () => {
    expect(extractDriveFileId('not a url at all')).toBeNull();
  });
});

describe('extractDriveResourceKey', () => {
  it('extracts the resource key from a real link that requires one', () => {
    expect(
      extractDriveResourceKey(
        'https://drive.google.com/file/d/0B_UwzYOTIwDTRkRBaVVvWm9XbFE/view?usp=sharing&resourcekey=0-gm0KFPq6Fi6FXwvfD45KzA',
      ),
    ).toBe('0-gm0KFPq6Fi6FXwvfD45KzA');
  });

  it('returns null when the link has no resource key (the common case)', () => {
    expect(extractDriveResourceKey('https://drive.google.com/file/d/1KF7cbUcsjkEQvfs5bFzhRNbTVBevhUBe/view?usp=sharing')).toBeNull();
  });

  it('returns null for a non-Drive URL, even one with a resourcekey param', () => {
    expect(extractDriveResourceKey('https://www.sie.org/x?resourcekey=abc')).toBeNull();
  });

  it('returns null for a malformed URL rather than throwing', () => {
    expect(extractDriveResourceKey('not a url at all')).toBeNull();
  });
});

describe('isReshimosLabel', () => {
  it('matches real reshima-labeled PDF links from the crawled dataset', () => {
    for (const label of [
      'רשימת כ"ק אד"ש',
      'רשימות חוברת יג',
      'רשימת הגהות לקונ\' בענין מקדש מעט זה בית רבינו שבבבל',
      'צילום הרשימה בכתי"ק',
      'רשימה - מאמר',
    ]) {
      expect(isReshimosLabel(label)).toBe(true);
    }
  });

  it('does not match a real sicha/maamar link label', () => {
    expect(isReshimosLabel(`שיחו"ק/ ח"כ ע' 574`)).toBe(false);
    expect(isReshimosLabel('תו"מ התוועדויות')).toBe(false);
  });
});
