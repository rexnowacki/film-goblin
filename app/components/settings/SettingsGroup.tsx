import type { ReactNode } from "react";

interface SettingsGroupProps {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  danger?: boolean;
}

export default function SettingsGroup({
  id,
  eyebrow,
  title,
  description,
  children,
  danger = false,
}: SettingsGroupProps) {
  return (
    <section
      id={id}
      className="settings-group"
      data-danger={danger ? "true" : undefined}
    >
      <header className="settings-group__header">
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="settings-group__body">{children}</div>
    </section>
  );
}
