import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'chassidushub:autoplay-on-hanacha';

export function useAutoplayOnHanacha(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!cancelled) setEnabledState(value === 'true');
      })
      .catch(() => {
        // Best-effort persistence only.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setEnabled(next: boolean) {
    setEnabledState(next);
    AsyncStorage.setItem(STORAGE_KEY, String(next)).catch(() => {
      // Best-effort persistence only.
    });
  }

  return [enabled, setEnabled];
}
