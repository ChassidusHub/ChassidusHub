/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-track-player');

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: { DocumentDir: '/tmp' },
    exists: jest.fn(() => Promise.resolve(false)),
    ls: jest.fn(() => Promise.resolve([])),
    stat: jest.fn(() => Promise.resolve({ size: '0' })),
    unlink: jest.fn(() => Promise.resolve()),
    mv: jest.fn(() => Promise.resolve()),
  },
  config: jest.fn(() => ({
    fetch: jest.fn(() => ({
      progress: jest.fn(() => Promise.resolve({ path: () => '/tmp/file' })),
    })),
  })),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    NavigationContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
