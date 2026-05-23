"use client";

import BottomSheet from "./BottomSheet";

interface Props {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  belowTopNav?: boolean;
  wide?: boolean;
}

export default function ThreadSheet({ open, onClose, title, children, belowTopNav = false, wide = false }: Props) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      belowTopNav={belowTopNav}
      panelClassName={wide ? "bottom-sheet-panel--thread" : undefined}
    >
      <div className="thread-sheet">
        {children}
      </div>
    </BottomSheet>
  );
}
