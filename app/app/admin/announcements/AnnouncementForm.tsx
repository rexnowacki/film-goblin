"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminPublishAnnouncement } from "@/lib/actions/admin/announcements";
import {
  TITLE_MAX,
  BODY_MAX,
  CTA_LABEL_MAX,
  PANEL_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
  type AnnouncementInput,
  type PanelColor,
  type TextColor,
} from "@/lib/actions/admin/announcement-validation";
import RecipientPicker from "./RecipientPicker";
import AnnouncementPreview from "./AnnouncementPreview";
import type { Searchable } from "@/components/recommend-modal-search";

interface Props {
  profiles: Searchable[];
}

const COLOR_HEX: Record<TextColor, string> = {
  pink: "#ff2d88",
  plum: "#9d6fc4",
  seafoam: "#7a9d92",
  bone: "#f3ecd8",
  void: "#0a0a0a",
};

function ColorSwatchRow<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly T[];
  selected: T;
  onChange: (next: T) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
      <span className="caps" style={{ fontSize: 11, minWidth: 80 }}>{label}</span>
      <div style={{ display: "flex", gap: 6 }}>
        {options.map(opt => {
          const isSelected = opt === selected;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              aria-label={opt}
              aria-pressed={isSelected}
              title={opt}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: COLOR_HEX[opt as TextColor] ?? "#000",
                border: isSelected ? "2px solid var(--bone)" : "2px solid transparent",
                outline: isSelected ? "1px solid var(--bone)" : "1px solid var(--muted)",
                outlineOffset: isSelected ? 1 : 0,
                cursor: "pointer",
                padding: 0,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: 10,
  background: "var(--void-2)",
  border: "2px solid var(--muted)",
  color: "var(--bone)",
  fontFamily: "var(--font-ui)",
  fontSize: 14,
};
const LABEL_STYLE: React.CSSProperties = { display: "block", marginBottom: 14 };
const CAPS_STYLE: React.CSSProperties = { fontSize: 11, marginBottom: 6 };

export default function AnnouncementForm({ profiles }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaOpen, setCtaOpen] = useState(false);
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [audience, setAudience] = useState<"everyone" | "specific">("everyone");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [panelColor, setPanelColor] = useState<PanelColor>("plum");
  const [titleColor, setTitleColor] = useState<TextColor>("bone");
  const [bodyColor, setBodyColor] = useState<TextColor>("bone");
  const [ctaColor, setCtaColor] = useState<PanelColor>("pink");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const input: AnnouncementInput = {
        title,
        body,
        cta_label: ctaOpen ? ctaLabel : null,
        cta_href: ctaOpen ? ctaHref : null,
        audience,
        recipient_ids: audience === "specific" ? recipientIds : [],
        panel_color: panelColor,
        title_color: titleColor,
        body_color: bodyColor,
        cta_color: ctaColor,
      };
      const result = await adminPublishAnnouncement(input);
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      router.push("/admin/announcements");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = !(audience === "specific" && recipientIds.length === 0);

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 720 }}>
      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>
          Title * ({title.length}/{TITLE_MAX})
        </div>
        <input
          style={INPUT_STYLE}
          value={title}
          onChange={e => setTitle(e.target.value.slice(0, TITLE_MAX))}
          required
          maxLength={TITLE_MAX}
        />
      </label>

      <label style={LABEL_STYLE}>
        <div className="caps" style={CAPS_STYLE}>
          Body * ({body.length}/{BODY_MAX})
        </div>
        <textarea
          style={{ ...INPUT_STYLE, minHeight: 100, resize: "vertical" }}
          rows={5}
          value={body}
          onChange={e => setBody(e.target.value.slice(0, BODY_MAX))}
          required
          maxLength={BODY_MAX}
        />
      </label>

      {!ctaOpen && (
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => setCtaOpen(true)}
          style={{ marginBottom: 14 }}
        >
          + Add a button
        </button>
      )}

      {ctaOpen && (
        <div
          style={{
            border: "1px solid var(--muted)",
            padding: 14,
            marginBottom: 14,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="caps" style={{ fontSize: 11 }}>Optional CTA button</span>
            <button
              type="button"
              onClick={() => {
                setCtaOpen(false);
                setCtaLabel("");
                setCtaHref("");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--blood)",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Remove button
            </button>
          </div>
          <label>
            <div className="caps" style={CAPS_STYLE}>
              Label ({ctaLabel.length}/{CTA_LABEL_MAX})
            </div>
            <input
              style={INPUT_STYLE}
              value={ctaLabel}
              onChange={e => setCtaLabel(e.target.value.slice(0, CTA_LABEL_MAX))}
              maxLength={CTA_LABEL_MAX}
              placeholder="e.g. Try it now"
            />
          </label>
          <label>
            <div className="caps" style={CAPS_STYLE}>URL (must start with /)</div>
            <input
              style={INPUT_STYLE}
              value={ctaHref}
              onChange={e => setCtaHref(e.target.value)}
              placeholder="/films"
            />
          </label>
        </div>
      )}

      <fieldset style={{ border: "1px solid var(--muted)", padding: 14, marginBottom: 14 }}>
        <legend className="caps" style={{ fontSize: 11, padding: "0 6px" }}>Audience *</legend>
        <label style={{ display: "block", marginBottom: 8, cursor: "pointer" }}>
          <input
            type="radio"
            name="audience"
            value="everyone"
            checked={audience === "everyone"}
            onChange={() => setAudience("everyone")}
            style={{ marginRight: 8 }}
          />
          Everyone
        </label>
        <label style={{ display: "block", cursor: "pointer" }}>
          <input
            type="radio"
            name="audience"
            value="specific"
            checked={audience === "specific"}
            onChange={() => setAudience("specific")}
            style={{ marginRight: 8 }}
          />
          Specific people
        </label>

        {audience === "specific" && (
          <div style={{ marginTop: 12 }}>
            <RecipientPicker
              profiles={profiles}
              selectedIds={recipientIds}
              onChange={setRecipientIds}
            />
          </div>
        )}
      </fieldset>

      <fieldset style={{ border: "1px solid var(--muted)", padding: 14, marginBottom: 14 }}>
        <legend className="caps" style={{ fontSize: 11, padding: "0 6px" }}>Theme</legend>
        <ColorSwatchRow
          label="Panel"
          options={PANEL_COLOR_OPTIONS}
          selected={panelColor}
          onChange={setPanelColor}
        />
        <ColorSwatchRow
          label="Title"
          options={TEXT_COLOR_OPTIONS}
          selected={titleColor}
          onChange={setTitleColor}
        />
        <ColorSwatchRow
          label="Body"
          options={TEXT_COLOR_OPTIONS}
          selected={bodyColor}
          onChange={setBodyColor}
        />
        <ColorSwatchRow
          label="CTA"
          options={PANEL_COLOR_OPTIONS}
          selected={ctaColor}
          onChange={setCtaColor}
        />
      </fieldset>

      <div style={{ marginBottom: 20 }}>
        <AnnouncementPreview
          title={title}
          body={body}
          cta_label={ctaOpen ? ctaLabel : null}
          cta_href={ctaOpen ? ctaHref : null}
          panel_color={panelColor}
          title_color={titleColor}
          body_color={bodyColor}
          cta_color={ctaColor}
        />
      </div>

      {err && (
        <div style={{ color: "var(--blood)", fontStyle: "italic", fontSize: 13, marginBottom: 14 }}>
          {err}
        </div>
      )}

      <button type="submit" className="btn" disabled={saving || !canSubmit}>
        {saving ? "Publishing…" : "Publish announcement"}
      </button>
    </form>
  );
}
