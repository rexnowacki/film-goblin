"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface Ctx {
  toast: (msg: string) => void;
}

const ToastContext = createContext<Ctx>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

/**
 * Single-slot toast. A new toast call replaces the current one and resets the
 * 2s timer. Mounted once at the layout root so any client component can call
 * `useToast().toast("Saved")` without per-component state.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMsg(text);
    timerRef.current = setTimeout(() => setMsg(null), 2000);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {msg !== null && (
        <div className="toast" role="status" aria-live="polite">
          {msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}
