import { createContext, useContext, type ReactNode } from 'react';
import {
  useAuth as useClerkAuth,
  useClerk as useClerkClient,
  useUser as useClerkUser,
} from '@clerk/react';

export type AppUser = {
  id: string;
  firstName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
  createdAt?: Date | null;
};

type AppAuthValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AppUser | null;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
  addListener: (listener: (event: { user: AppUser | null }) => void) => () => void;
};

const AppAuthContext = createContext<AppAuthValue | null>(null);

export function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const auth = useClerkAuth();
  const { user } = useClerkUser();
  const clerk = useClerkClient();

  return (
    <AppAuthContext.Provider
      value={{
        isLoaded: auth.isLoaded,
        isSignedIn: Boolean(auth.isSignedIn),
        user: user as AppUser | null,
        signOut: clerk.signOut,
        addListener: (listener) => clerk.addListener(({ user: nextUser }) => listener({ user: nextUser as AppUser | null })),
      }}
    >
      {children}
    </AppAuthContext.Provider>
  );
}

export function MockAuthProvider({ children }: { children: ReactNode }) {
  const mockUser: AppUser = {
    id: 'mock-student',
    firstName: 'طالب تجريبي',
    username: 'mock-student',
    primaryEmailAddress: { emailAddress: 'student@tawjeeh.local' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  return (
    <AppAuthContext.Provider
      value={{
        isLoaded: true,
        isSignedIn: true,
        user: mockUser,
        signOut: async () => undefined,
        addListener: () => () => undefined,
      }}
    >
      {children}
    </AppAuthContext.Provider>
  );
}

function useAppAuthContext() {
  const value = useContext(AppAuthContext);
  if (!value) throw new Error('App auth hooks must be used inside an auth provider');
  return value;
}

export function useAppAuth() {
  const { isLoaded, isSignedIn } = useAppAuthContext();
  return { isLoaded, isSignedIn };
}

export function useAppUser() {
  const { isLoaded, user } = useAppAuthContext();
  return { isLoaded, user };
}

export function useAppClerk() {
  const { addListener, signOut } = useAppAuthContext();
  return { addListener, signOut };
}