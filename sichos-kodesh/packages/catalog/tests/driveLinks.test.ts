import { describe, expect, it } from 'vitest';
import { extractDriveFileId } from '../src/driveLinks.js';

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

  it('returns null for a non-Drive URL', () => {
    expect(extractDriveFileId('https://www.sie.org/templates/sie/article_cdo/aid/2328350/jewish/x.htm')).toBeNull();
  });

  it('returns null for a Drive URL that is not the /file/d/ share shape', () => {
    expect(extractDriveFileId('https://drive.google.com/drive/folders/1abc')).toBeNull();
  });
});
