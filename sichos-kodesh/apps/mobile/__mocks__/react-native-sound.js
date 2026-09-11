// Minimal Jest manual mock - see react-native-blob-util's mock for why one is needed.
class Sound {
  constructor(_file, _basePath, callback) {
    if (callback) callback(null);
  }
  play(onEnd) {
    if (onEnd) onEnd(true);
    return this;
  }
  pause(cb) {
    if (cb) cb();
    return this;
  }
  stop(cb) {
    if (cb) cb();
    return this;
  }
  release() {}
  isLoaded() {
    return true;
  }
}

module.exports = Sound;
