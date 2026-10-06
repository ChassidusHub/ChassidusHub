// Jest mock for react-native-screens
// The native module is not available in the test environment.
module.exports = {
  enableScreens: jest.fn(),
  screensEnabled: jest.fn(() => true),
  Screen: 'Screen',
  ScreenContainer: 'ScreenContainer',
  NativeScreen: 'NativeScreen',
  NativeScreenContainer: 'NativeScreenContainer',
};
