"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "@/lib/api";
import {
  clearSession,
  getStoredUser,
  getToken,
  setSession,
  updateStoredUser,
} from "@/lib/auth-storage";
import type { AuthPayload, User } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setToken(getToken());
    setUserState(getStoredUser());
    setReady(true);
  }, []);

  const applyAuth = useCallback((payload: AuthPayload) => {
    setSession(payload.token, payload.user);
    setToken(payload.token);
    setUserState(payload.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiRequest<AuthPayload>("/auth/login", {
        body: { email, password, device_name: "website" },
      });
      applyAuth(res.data);
    },
    [applyAuth],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await apiRequest<AuthPayload>("/auth/register", {
        body: {
          name,
          email,
          password,
          password_confirmation: password,
        },
      });
      applyAuth(res.data);
    },
    [applyAuth],
  );

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUserState(null);
  }, []);

  const setUser = useCallback((next: User) => {
    updateStoredUser(next);
    setUserState(next);
  }, []);

  const value = useMemo(
    () => ({ user, token, ready, login, register, logout, setUser }),
    [user, token, ready, login, register, logout, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
