"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface Ctx {
  toast: (msg: string, durationMs?: number, options?: { href?: string }) => void;
}

const ToastContext = createContext<Ctx>({ toast: () => {} });
const DEFAULT_TOAST_DURATION_MS = 2000;

export function useToast() {
  return useContext(ToastContext);
}

/**
 * Single-slot toast. A new toast call replaces the current one and resets the
 * 2s timer. Mounted once at the layout root so any client component can call
 * `useToast().toast("Saved")` without per-component state.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toastState, setToastState] = useState<{ text: string; href?: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((text: string, durationMs = DEFAULT_TOAST_DURATION_MS, options?: { href?: string }) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToastState({ text, href: options?.href });
    timerRef.current = setTimeout(() => setToastState(null), durationMs);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toastState !== null && (
        toastState.href ? (
          <a className="toast toast--interactive" role="status" aria-live="polite" href={toastState.href}>
            {toastState.text}
          </a>
        ) : (
          <div className="toast" role="status" aria-live="polite">
            {toastState.text}
          </div>
        )
      )}
    </ToastContext.Provider>
  );
}
