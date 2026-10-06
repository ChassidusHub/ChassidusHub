/**
 * @format
 */

import { AppRegistry } from 'react-native';
import TrackPlayer from 'react-native-track-player';
import App from './App';
import { name as appName } from './app.json';
import { PlaybackService } from './src/player/trackPlayerService';
import { runBackgroundSync } from './src/background/backgroundSyncTask';

AppRegistry.registerComponent(appName, () => App);
TrackPlayer.registerPlaybackService(() => PlaybackService);
// Started with no UI by android/.../background/BackgroundSyncWorker.kt.
AppRegistry.registerHeadlessTask('ChassidusHubBackgroundSync', () => runBackgroundSync);
