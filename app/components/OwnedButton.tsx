"use client";

import { useState, useTransition } from "react";
import { addToLibrary, removeFromLibrary } from "@/lib/actions/library";

interface Props {
  filmId: string;
  initialOwned: boolean;
  onAdded?: () => void;
}

export default function OwnedButton({ filmId, initialOwned, onAdded }: Props) {
  const [owned, setOwned] = useState(initialOwned);
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      try {
        if (owned) {
          await removeFromLibrary(filmId);
          setOwned(false);
        } else {
          await addToLibrary(filmId);
          setOwned(true);
          onAdded?.();
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  return (
    <button
      className="btn btn-outline btn-lg"
      onClick={toggle}
      disabled={pending}
      style={{ color: "var(--bone)", borderColor: "var(--bone)" }}
    >
      {owned ? "✓ In Library" : "+ Library"}
    </button>
  );
}
