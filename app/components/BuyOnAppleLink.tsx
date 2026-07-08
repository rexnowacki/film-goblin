"use client";

import { addPendingBuy } from "@/lib/purchase/pending";

interface Props {
  filmId: string;
  title: string;
  price: number | null;
  href: string;
  signedIn: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

// Outbound Apple TV buy link that arms the purchase-confirmation prompt
// (spec 2026-07-07-buy-claim-loop). Renders the same anchor the caller
// would have rendered — appearance is entirely the caller's. The click
// handler only records; it never blocks or delays navigation.
export default function BuyOnAppleLink({ filmId, title, price, href, signedIn, className, style, children }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      style={style}
      onClick={() => {
        if (!signedIn) return;
        addPendingBuy(window.localStorage, {
          filmId,
          title,
          price,
          clickedAt: new Date().toISOString(),
        });
      }}
    >
      {children}
    </a>
  );
}
