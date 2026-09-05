import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as CognitoAuth from "./cognito";

interface AuthContextValue {
  isLoading: boolean;
  isSignedIn: boolean;
  email: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = await CognitoAuth.getCurrentIdToken();
    setIsSignedIn(!!token);
    setEmail(CognitoAuth.getCurrentUserEmail());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (emailInput: string, password: string) => {
      await CognitoAuth.signIn(emailInput, password);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(() => {
    CognitoAuth.signOut();
    setIsSignedIn(false);
    setEmail(null);
  }, []);

  const value = useMemo(
    () => ({ isLoading, isSignedIn, email, signIn, signOut }),
    [isLoading, isSignedIn, email, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
