import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { ApiError, get, post } from "../lib/api";
import type { User } from "../lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return (await get<{ user: User }>("/auth/me")).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
  });

  const setUser = useCallback(
    (u: User | null) => {
      qc.setQueryData(["me"], u);
      // Never show one user's cached data to the next. (Keep the "me" entry itself:
      // clearing it would detach the auth state from the cache and the screen wouldn't update.)
      if (!u) qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    },
    [qc],
  );

  // Any 401 from the API (expired session, password changed elsewhere) signs the user out locally
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener("sp:unauthorized", onUnauthorized);
    return () => window.removeEventListener("sp:unauthorized", onUnauthorized);
  }, [setUser]);

  const logout = useCallback(async () => {
    await post("/auth/logout").catch(() => undefined);
    setUser(null);
  }, [setUser]);

  return <AuthContext.Provider value={{ user: me.data ?? null, loading: me.isLoading, setUser, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
