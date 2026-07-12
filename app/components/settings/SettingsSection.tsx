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
      className="settings-section"
      data-danger={danger ? "true" : undefined}
    >
      <header className="settings-section__header">
        <div className="caps settings-section__eyebrow">{eyebrow}</div>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="settings-section__content">{children}</div>
    </section>
  );
}
