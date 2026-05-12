import type { ReactNode } from "react";

interface SettingsSectionProps {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  danger?: boolean;
}

export default function SettingsSection({
  id,
  eyebrow,
  title,
  description,
  children,
  danger = false,
}: SettingsSectionProps) {
  return (
    <section
      id={id}
      style={{
        borderTop: `1px solid ${danger ? "var(--danger)" : "#333"}`,
        paddingTop: 24,
        scrollMarginTop: 96,
      }}
    >
      <div className="caps" style={{ fontSize: 11, marginBottom: 8, color: danger ? "var(--danger)" : "var(--accent)" }}>
        {eyebrow}
      </div>
      <h2 className="head" style={{ fontSize: 24, margin: "0 0 6px" }}>
        {title}
      </h2>
      {description ? (
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 14,
            color: "var(--muted)",
            lineHeight: 1.5,
            margin: "0 0 18px",
          }}
        >
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}
