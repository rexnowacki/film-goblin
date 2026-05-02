"use client";

import BottomSheet from "@/components/BottomSheet";
import { CovenCompactRow } from "@/components/coven/CovenChipRow";
import type { CovenfolkRanked } from "@/lib/queries/coven-interactions";

interface Props {
  open: boolean;
  onClose: () => void;
  members: CovenfolkRanked[];
}

/**
 * Full coven roster in a BottomSheet. Same score order as the chip row
 * (top scorers first, then alphabetical tail). Compact rows: avatar +
 * username + Leave button. Tap username to navigate to /p/<username>.
 */
export default function CovenSeeAllSheet({ open, onClose, members }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} title={`Your Coven · ${members.length}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 4px 4px" }}>
        {members.map(m => <CovenCompactRow key={m.id} member={m} />)}
      </div>
    </BottomSheet>
  );
}
