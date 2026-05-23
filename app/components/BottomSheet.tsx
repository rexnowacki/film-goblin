"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  belowTopNav?: boolean;
  panelClassName?: string;
}

export default function BottomSheet({ open, onClose, title, children, belowTopNav = false, panelClassName }: Props) {
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

  // Focus the sheet panel exactly once when it opens. Kept separate from
  // the escape-key effect because parent re-renders typically pass a new
  // `onClose` function identity; bundling focus with that listener would
  // re-steal focus on every keystroke from any input inside the sheet.
  useEffect(() => {
    if (open) sheetRef.current?.focus();
  }, [open]);

  // Escape-to-close listener. Re-binds when `onClose` identity changes;
  // safe because nothing here touches focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={belowTopNav ? "bottom-sheet-overlay bottom-sheet-overlay--below-top-nav" : "bottom-sheet-overlay"}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      role="dialog"
      aria-modal={belowTopNav ? undefined : true}
      aria-labelledby={titleId}
    >
      <div
        ref={sheetRef}
        className={panelClassName ? `bottom-sheet-panel ${panelClassName}` : "bottom-sheet-panel"}
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
            onClick={(e) => { e.stopPropagation(); onClose(); }}
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
