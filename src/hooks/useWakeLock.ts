import { useState, useEffect, useCallback } from 'react';

export function useWakeLock() {
  const [isLocked, setIsLocked] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported('wakeLock' in navigator);
  }, []);

  const requestLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) {
      return false;
    }
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      setIsLocked(true);
      sentinel.addEventListener('release', () => {
        setIsLocked(false);
      });
      return true;
    } catch (err) {
      console.warn('[WakeLock] Error requesting screen wake lock:', err);
      setIsLocked(false);
      return false;
    }
  }, []);

  return { isLocked, isSupported, requestLock };
}
