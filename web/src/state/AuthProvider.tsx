import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthValue {
  session: Session | null;
  user: User | null;
  /** True until the initial session lookup settles, so we don't flash the login page. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const AUTH_REQUEST_TIMEOUT_MS = 15_000;

function withAuthTimeout<T>(request: PromiseLike<T>, action: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(
        new Error(
          `${action} timed out because the account service did not respond. Please try again.`,
        ),
      );
    }, AUTH_REQUEST_TIMEOUT_MS);

    Promise.resolve(request).then(
      (result) => {
        window.clearTimeout(timeout);
        resolve(result);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void withAuthTimeout(supabase.auth.getSession(), 'Restoring your session')
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .catch((error: unknown) => {
        // A stale or unreachable Auth service must not leave the whole app on
        // its startup spinner. The user can still reach the login screen and
        // retry once connectivity returns.
        console.error('Could not restore the Supabase session:', error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Covers token refreshes and sign-out in another tab, so two open tabs
    // never disagree about who is signed in.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      async signIn(email, password) {
        try {
          const { error } = await withAuthTimeout(
            supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            }),
            'Sign-in',
          );
          return { error: error?.message ?? null };
        } catch (error: unknown) {
          return {
            error: errorMessage(
              error,
              'Could not reach the sign-in service. Please try again.',
            ),
          };
        }
      },
      async sendPasswordReset(email) {
        try {
          const { error } = await withAuthTimeout(
            supabase.auth.resetPasswordForEmail(email.trim(), {
              redirectTo: window.location.origin,
            }),
            'Password reset',
          );
          return { error: error?.message ?? null };
        } catch (error: unknown) {
          return {
            error: errorMessage(
              error,
              'Could not reach the password-reset service. Please try again.',
            ),
          };
        }
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
