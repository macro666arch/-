"use client";

import { useEffect, useState } from "react";
import {
  AUTH_CHANGED_EVENT,
  clearAuthSession,
  getAuthNotice,
  getMe,
  getStoredUser,
  getToken,
  storeAuthUser,
  type AuthUser,
} from "@/lib/auth";
import { ApiError, readableError } from "@/lib/http";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function refresh() {
      const token = getToken();
      if (!token) {
        if (!active) return;
        setUser(null);
        setError(getAuthNotice());
        setReady(true);
        return;
      }

      const cached = getStoredUser();
      if (cached && active) setUser(cached);

      try {
        const current = await getMe(token);
        storeAuthUser(current, false);
        if (!active) return;
        setUser(current);
        setError("");
      } catch (requestError) {
        if (!active) return;
        if (requestError instanceof ApiError && requestError.status === 401) {
          clearAuthSession();
          setUser(null);
          setError("登录已过期，请重新登录");
        } else {
          // A network outage must not erase a still-valid cached login.
          setUser(cached);
          setError(readableError(requestError));
        }
      } finally {
        if (active) setReady(true);
      }
    }

    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(AUTH_CHANGED_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      active = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  function logout() {
    clearAuthSession();
    setUser(null);
    setError("");
  }

  return {
    user,
    ready,
    error,
    authenticated: !!user && !!getToken(),
    logout,
  };
}
