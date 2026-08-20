import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "./api";

export interface AuthUser {
  user_id: string;
  username: string;
  display_name?: string;
  role: UserRole;
  site_id?: number;
}

export type UserRole =
  | "field_worker"
  | "field_supervisor"
  | "site_research_scientist"
  | "central_admin"
  | "site_data_manager"
  | "central_data_manager"
  | "us_collaborator";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login(username: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      const token = localStorage.getItem("access_token");
      const userData = localStorage.getItem("user");
      if (token && userData) {
        setUser(JSON.parse(userData));
      }
      // A stored token is not proof of a live session (it may be expired or the
      // server may have been reset). Validate it once against the API so a dead
      // session lands on the login page instead of a console full of 401s.
      if (token) {
        try {
          const res = await fetch(
            `${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/users/me`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.status === 401 || res.status === 403) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("user");
            if (!cancelled) setUser(null);
          }
        } catch {
          // Offline or server unreachable: keep the cached session.
        }
      }
      if (!cancelled) setLoading(false);
    }
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(username: string, password: string) {
    const result = await api.post<{ access_token: string; user: AuthUser }>("/auth/login", {
      username,
      password,
    });
    localStorage.setItem("access_token", result.access_token);
    localStorage.setItem("user", JSON.stringify(result.user));
    setUser(result.user);
  }

  function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
