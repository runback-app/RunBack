import { TERMS_VERSION } from './pages/TermsPage';
import { siteOrigin } from './lib/native';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { fetchProfile } from './lib/api';
import type { Profile } from './lib/types';
import { signupRedirect } from './lib/invite';

type AuthState = {
  ready: boolean;
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, next?: string) => Promise<{ needsEmailConfirm: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Try again.";
  if (/already registered|already exists/i.test(message)) return 'That email already has an account. Sign in instead.';
  if (/password should be at least/i.test(message)) return 'Use a password with at least 6 characters.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first. Check your inbox for the link.';
  if (/rate limit/i.test(message)) return 'Too many tries. Wait a minute and try again.';
  if (/not authorized/i.test(message)) return "Sign-up emails aren't set up yet. Ask the Runback team to turn them on.";
  if (/failed to fetch|network/i.test(message)) return "Can't reach Runback. Check your connection.";
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await fetchProfile(userId));
    } catch {
      // Keep whatever we had; pages show their own errors.
    }
  }, [userId]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      userId,
      profile,
      refreshProfile,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(friendlyAuthError(error.message));
      },
      async signUp(name, email, password, next = '/') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: name.trim(), terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() },
            emailRedirectTo: signupRedirect(siteOrigin(), next),
          },
        });
        if (error) throw new Error(friendlyAuthError(error.message));
        return { needsEmailConfirm: !data.session };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [ready, session, userId, profile, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
