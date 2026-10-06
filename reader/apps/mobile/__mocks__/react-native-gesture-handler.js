// Jest mock for react-native-gesture-handler
// The native module is not available in the test environment.
const React = require('react');
const { View, ScrollView, FlatList, Switch, TextInput } = require('react-native');

const GestureHandlerRootView = ({ children }) => React.createElement(View, null, children);

module.exports = {
  GestureHandlerRootView,
  Swipeable: View,
  DrawerLayout: View,
  State: {},
  PanGestureHandler: View,
  TapGestureHandler: View,
  FlingGestureHandler: View,
  ForceTouchGestureHandler: View,
  LongPressGestureHandler: View,
  NativeViewGestureHandler: View,
  PinchGestureHandler: View,
  RotationGestureHandler: View,
  RawButton: View,
  BaseButton: View,
  RectButton: View,
  BorderlessButton: View,
  ScrollView,
  Switch,
  TextInput,
  FlatList,
  gestureHandlerRootHOC: (Component) => Component,
  Directions: {},
};
