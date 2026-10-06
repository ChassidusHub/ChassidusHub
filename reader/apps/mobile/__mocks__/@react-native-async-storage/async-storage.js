// In-memory stand-in for AsyncStorage under Jest - the real module needs a
// native module that doesn't exist in the test environment. Applied
// automatically to every test (a node_modules manual mock).
const store = new Map();

module.exports = {
  getItem: jest.fn((key) => Promise.resolve(store.has(key) ? store.get(key) : null)),
  setItem: jest.fn((key, value) => {
    store.set(key, String(value));
    return Promise.resolve();
  }),
  removeItem: jest.fn((key) => {
    store.delete(key);
    return Promise.resolve();
  }),
  clear: jest.fn(() => {
    store.clear();
    return Promise.resolve();
  }),
  getAllKeys: jest.fn(() => Promise.resolve([...store.keys()])),
  multiGet: jest.fn((keys) => Promise.resolve(keys.map((key) => [key, store.has(key) ? store.get(key) : null]))),
};
