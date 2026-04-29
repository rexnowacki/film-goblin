"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { signOut } from "@/lib/actions/auth";

interface Props {
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}

export default function UserMenu({ handle, displayName, avatarUrl, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Open account menu"
        style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
      >
        <Avatar name={displayName || handle} color="var(--accent)" size={36} url={avatarUrl} />
      </button>
      {open && (
        <div style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 8px)",
          background: "var(--bone)",
          color: "var(--void)",
          border: "2px solid var(--void)",
          boxShadow: "4px 4px 0 var(--accent)",
          minWidth: 160,
          zIndex: 50,
        }}>
          <Link
            href={`/p/${encodeURIComponent(handle)}`}
            onClick={() => setOpen(false)}
            style={{ display: "block", padding: "10px 14px", borderBottom: "1px solid var(--void)", fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--void)", textDecoration: "none" }}
          >
            @{handle}
          </Link>
          <Link
            href="/library"
            onClick={() => setOpen(false)}
            style={{ display: "block", padding: "10px 14px", color: "var(--void)", textDecoration: "none", fontFamily: "var(--font-ui)", fontSize: 12, borderBottom: "1px solid var(--void)" }}
          >
            Your Grimoire
          </Link>
          <Link
            href="/watched"
            onClick={() => setOpen(false)}
            style={{ display: "block", padding: "10px 14px", color: "var(--void)", textDecoration: "none", fontFamily: "var(--font-ui)", fontSize: 12, borderBottom: "1px solid var(--void)" }}
          >
            Diary
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              style={{ display: "block", padding: "10px 14px", color: "var(--accent-deep)", textDecoration: "none", fontFamily: "var(--font-ui)", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "1px solid var(--void)" }}
            >
              Admin
            </Link>
          )}
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            style={{ display: "block", padding: "10px 14px", color: "var(--void)", textDecoration: "none", fontFamily: "var(--font-ui)", fontSize: 12 }}
          >
            Settings
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent", border: 0, cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--blood)" }}
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
