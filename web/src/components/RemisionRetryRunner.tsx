import { useEffect } from 'react';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { flushQueuedRemisions } from '../lib/remisionOutbox';

/** Retries locally queued remisión drafts while open, and again after reopening. */
export default function RemisionRetryRunner() {
  const { user } = useAuth();
  const data = useData();

  useEffect(() => {
    if (!user) return;
    let active = true;
    let running = false;
    const run = async (force = false) => {
      if (running) return;
      running = true;
      try {
        const result = await flushQueuedRemisions(user.id, undefined, force);
        if (active && result.changed) await data.refresh();
      } finally {
        running = false;
      }
    };
    const online = () => void run(true);
    window.addEventListener('online', online);
    void run(true);
    const timer = window.setInterval(() => void run(), 30_000);
    return () => {
      active = false;
      window.removeEventListener('online', online);
      window.clearInterval(timer);
    };
  }, [user, data.refresh]);

  return null;
}
