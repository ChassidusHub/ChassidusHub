import RNBlobUtil from 'react-native-blob-util';

/** Opens a downloaded PDF in the OS's own viewer via an Android ACTION_VIEW intent - no bundled PDF renderer needed. */
export function openPdf(localPath: string): Promise<boolean | null> {
  return RNBlobUtil.android.actionViewIntent(localPath, 'application/pdf');
}
