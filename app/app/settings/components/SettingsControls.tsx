import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

const inputStyle = {
  width: "100%",
  padding: 10,
  background: "var(--void-2)",
  border: "2px solid var(--muted)",
  color: "var(--bone)",
  boxSizing: "border-box" as const,
};

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
}

export function SettingsTextField({ label, error, style, ...props }: TextFieldProps) {
  return (
    <label>
      <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>{label}</div>
      <input
        {...props}
        style={{
          ...inputStyle,
          border: `2px solid ${error ? "var(--danger)" : "var(--muted)"}`,
          ...style,
        }}
      />
      {error ? <SettingsInlineMessage tone="danger">{error}</SettingsInlineMessage> : null}
    </label>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function SettingsTextArea({ label, style, ...props }: TextAreaProps) {
  return (
    <label>
      <div className="caps" style={{ fontSize: 11, marginBottom: 6 }}>{label}</div>
      <textarea
        {...props}
        style={{
          ...inputStyle,
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          ...style,
        }}
      />
    </label>
  );
}

export function SettingsCheckbox({
  name,
  defaultChecked,
  children,
}: {
  name: string;
  defaultChecked?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="check-zine">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span className="check-zine__box" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

export function SettingsInlineMessage({
  tone,
  children,
}: {
  tone: "danger" | "accent" | "muted";
  children: ReactNode;
}) {
  const color = tone === "danger" ? "var(--danger)" : tone === "accent" ? "var(--accent)" : "var(--muted)";
  return (
    <div style={{ marginTop: 6, color, fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13 }}>
      {children}
    </div>
  );
}
