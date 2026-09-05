import { useCallback, useMemo } from 'react';
import { useAuth } from './AuthProvider';
import { useData } from './DataProvider';
import { useToast } from './ToastProvider';
import { makeWriter } from '../lib/write';
import type { Writer } from '../lib/write';

/**
 * Every write goes through here so three things always happen together: the
 * row carries the signed-in user_id, the in-memory copy is refetched, and the
 * person is told what happened. `run` returns the error message instead of
 * throwing, because the forms use it to VETO closing — the app learned that
 * one the hard way: a failed save that still closed the sheet reads as the app
 * losing what you typed rather than rejecting it.
 */
export function useWriter(): {
  writer: Writer;
  run: (fn: (w: Writer) => Promise<unknown>, successMessage?: string) => Promise<string | null>;
} {
  const { user } = useAuth();
  const { refresh } = useData();
  const toast = useToast();

  const writer = useMemo(() => makeWriter(user?.id ?? ''), [user?.id]);

  const run = useCallback(
    async (fn: (w: Writer) => Promise<unknown>, successMessage?: string) => {
      if (!user?.id) return 'La sesión expiró. Vuelva a ingresar.';
      try {
        await fn(writer);
        await refresh();
        if (successMessage) toast(successMessage, 'success');
        return null;
      } catch (e) {
        // No error toast: every write in the console happens inside a form that
        // shows the message in place and stays open. Toasting it as well says
        // the same thing twice, in two places, for the same mistake.
        return e instanceof Error ? e.message : String(e);
      }
    },
    [user?.id, writer, refresh, toast],
  );

  return { writer, run };
}
