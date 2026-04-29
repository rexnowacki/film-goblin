"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function BottomSheet({ open, onClose, title, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Lock page scroll while the sheet is open. The robust pattern below works on
  // iOS Safari, where `body { overflow: hidden }` alone leaves the page able to
  // rubber-band scroll. We capture the scroll position, pin the body via
  // position: fixed (preserving the visual scroll offset via negative top), and
  // restore on close so the page lands back where the user was.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  // Escape to close + focus the sheet panel on open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    sheetRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="bottom-sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={sheetRef}
        className="bottom-sheet-panel"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="bottom-sheet-handle" aria-hidden="true" />
        <div className="bottom-sheet-header">
          <h2 id={titleId} className="head" style={{ fontSize: 22, margin: 0 }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="bottom-sheet-close"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="bottom-sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
