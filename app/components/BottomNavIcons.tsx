import type { SVGProps } from "react";

const baseProps: Pick<SVGProps<SVGSVGElement>, "viewBox" | "fill" | "stroke" | "strokeWidth" | "strokeLinecap" | "strokeLinejoin"> = {
  viewBox: "0 0 64 64",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function HomeIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M8 28 L32 8 L56 28" />
      <path d="M14 26 L14 54 L50 54 L50 26" />
      <path d="M26 54 L26 38 L38 38 L38 54" />
    </svg>
  );
}

export function DiscoverIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <circle cx="32" cy="28" r="18" />
      <path d="M24 22 Q22 26 24 30" strokeWidth="2" opacity="0.7" />
      <path d="M14 50 L20 44" />
      <path d="M50 50 L44 44" />
      <path d="M12 54 L52 54" />
      <path d="M20 44 Q32 50 44 44" />
    </svg>
  );
}

export function CovenIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <ellipse cx="32" cy="22" rx="22" ry="3" />
      <path d="M 11 23 Q 9 38 16 50 Q 22 56 32 56 Q 42 56 48 50 Q 55 38 53 23" />
      <path d="M 18 56 Q 14 58 14 60 Q 14 61.5 16 61" />
      <path d="M 46 56 Q 50 58 50 60 Q 50 61.5 48 61" />
      <path d="M 10 22 Q 7 22 7 25" />
      <path d="M 54 22 Q 57 22 57 25" />
    </svg>
  );
}

export function ForYouIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M32 10 C18 10 10 20 10 32 C10 44 18 54 32 54 C46 54 54 44 54 32 C54 20 46 10 32 10 Z" />
      <path d="M24 32 L30 38 L40 26" strokeWidth={3} />
    </svg>
  );
}

export function CollectionsIcon({ className }: { className?: string }) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <defs>
        <mask id="bn-behind-middle">
          <rect width="64" height="64" fill="white" />
          <rect x="19" y="12" width="26" height="38" rx="3" fill="black" />
        </mask>
        <mask id="bn-behind-front">
          <rect width="64" height="64" fill="white" />
          <rect x="28" y="14" width="26" height="38" rx="3" transform="rotate(12 41 33)" fill="black" />
        </mask>
      </defs>
      <g mask="url(#bn-behind-middle)">
        <g mask="url(#bn-behind-front)">
          <rect x="10" y="14" width="26" height="38" rx="3" transform="rotate(-12 23 33)" />
        </g>
      </g>
      <g mask="url(#bn-behind-front)">
        <rect x="19" y="12" width="26" height="38" rx="3" />
      </g>
      <g transform="rotate(12 41 33)">
        <rect x="28" y="14" width="26" height="38" rx="3" />
        <path d="M 33 30 C 33 25, 36.5 22, 41 22 C 45.5 22, 49 25, 49 30 C 49 33, 47.5 35, 46 36 L 46 39 L 44 39 L 44 41 L 42 41 L 42 39 L 40 39 L 40 41 L 38 41 L 38 39 L 36 39 L 36 36 C 34.5 35, 33 33, 33 30 Z" />
        <ellipse cx="38" cy="29.5" rx="1.5" ry="2" fill="currentColor" stroke="none" />
        <ellipse cx="44" cy="29.5" rx="1.5" ry="2" fill="currentColor" stroke="none" />
        <path d="M 41 32 L 40 34 L 42 34 Z" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}
