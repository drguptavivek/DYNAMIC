import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "./api";

export interface AuthUser {
  user_id: string;
  username: string;
  display_name?: string;
  role: "field_worker" | "field_supervisor" | "site_research_scientist" | "central_admin";
  site_id?: number;
}

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
    const token = localStorage.getItem("access_token");
    const userData = localStorage.getItem("user");
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
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
