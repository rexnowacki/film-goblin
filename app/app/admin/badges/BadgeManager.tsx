"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminCreateBadge,
  adminReevaluateBadges,
} from "@/lib/actions/admin/badges";
import {
  BADGE_CONDITIONS,
  BADGE_DESCRIPTION_MAX,
  BADGE_NAME_MAX,
  BADGE_SLUG_MAX,
  BADGE_THRESHOLD_MAX,
  describeBadgeCondition,
  slugifyBadgeName,
  type BadgeConditionKind,
} from "@/lib/badges/definition";
import type { AdminBadgeRow } from "@/lib/queries/admin/badges";

interface UploadResult {
  url?: string;
  error?: string;
}

export default function BadgeManager({ badges }: { badges: AdminBadgeRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [conditionKind, setConditionKind] = useState<BadgeConditionKind>("watch_log_count");
  const [threshold, setThreshold] = useState("25");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugifyBadgeName(value));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!file) {
      setError("Choose SVG or PNG artwork.");
      return;
    }

    setSaving(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const uploadResponse = await fetch("/api/admin/badges/image", {
        method: "POST",
        body: form,
      });
      const uploaded = await uploadResponse.json() as UploadResult;
      if (!uploadResponse.ok || !uploaded.url) {
        setError(uploaded.error ?? "Artwork upload failed.");
        return;
      }

      const result = await adminCreateBadge({
        name,
        slug,
        description,
        imageUrl: uploaded.url,
        conditionKind,
        threshold: Number(threshold),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setNotice(
        result.awardedCount == null
          ? "Badge created. Award count is unavailable; refresh the ledger to confirm it."
          : result.awardedCount === 1
          ? "Badge created and awarded to 1 qualifying member."
          : `Badge created and awarded to ${result.awardedCount} qualifying members.`,
      );
      setName("");
      setSlug("");
      setSlugTouched(false);
      setDescription("");
      setConditionKind("watch_log_count");
      setThreshold("25");
      setFile(null);
      setFileInputKey(key => key + 1);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Badge creation failed.");
    } finally {
      setSaving(false);
    }
  }

  async function reevaluate() {
    setError(null);
    setNotice(null);
    setReevaluating(true);
    try {
      const result = await adminReevaluateBadges();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(
        result.awardedCount === 1
          ? "Award engine added 1 missing badge."
          : `Award engine added ${result.awardedCount} missing badges.`,
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Badge re-evaluation failed.");
    } finally {
      setReevaluating(false);
    }
  }

  const selectedCondition = BADGE_CONDITIONS.find(option => option.value === conditionKind)!;

  return (
    <div className="admin-badge-layout">
      <section className="admin-form-surface admin-badge-create" aria-labelledby="create-badge-title">
        <div className="eyebrow">New definition</div>
        <h2 id="create-badge-title">Create a badge</h2>
        <p className="admin-badge-intro">
          New definitions are evaluated against every existing watch diary as soon as they are saved.
        </p>

        <form className="admin-badge-form" onSubmit={submit}>
          <label>
            <span>Name</span>
            <input
              required
              maxLength={BADGE_NAME_MAX}
              value={name}
              onChange={event => onNameChange(event.target.value)}
              placeholder="Night Fiend"
            />
          </label>

          <label>
            <span>Slug</span>
            <input
              required
              maxLength={BADGE_SLUG_MAX}
              value={slug}
              onChange={event => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
              placeholder="night-fiend"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            />
          </label>

          <label className="admin-badge-form__wide">
            <span>Description</span>
            <textarea
              required
              maxLength={BADGE_DESCRIPTION_MAX}
              rows={3}
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="Plain-language explanation shown on member profiles."
            />
            <small>{description.length}/{BADGE_DESCRIPTION_MAX}</small>
          </label>

          <label>
            <span>Condition</span>
            <select
              value={conditionKind}
              onChange={event => setConditionKind(event.target.value as BadgeConditionKind)}
            >
              {BADGE_CONDITIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <small>{selectedCondition.help}</small>
          </label>

          <label>
            <span>At least</span>
            <input
              required
              type="number"
              min={1}
              max={BADGE_THRESHOLD_MAX}
              step={1}
              value={threshold}
              onChange={event => setThreshold(event.target.value)}
            />
            <small>{describeBadgeCondition(conditionKind, Number(threshold) || 0)}</small>
          </label>

          <label className="admin-badge-form__wide">
            <span>Artwork</span>
            <input
              key={fileInputKey}
              required
              type="file"
              accept=".svg,.png,image/svg+xml,image/png"
              onChange={event => setFile(event.target.files?.[0] ?? null)}
            />
            <small>Square SVG or PNG, up to 2 MB.</small>
          </label>

          {previewUrl && (
            <div className="admin-badge-preview admin-badge-form__wide">
              <img src={previewUrl} alt="Badge artwork preview" />
              <div>
                <span>Preview</span>
                <strong>{name.trim() || "Untitled badge"}</strong>
                <small>{description.trim() || "Description will appear here."}</small>
              </div>
            </div>
          )}

          {error && <div className="admin-badge-message is-error" role="alert">{error}</div>}
          {notice && <div className="admin-badge-message is-success" role="status">{notice}</div>}

          <button className="btn admin-badge-form__wide" type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create badge"}
          </button>
        </form>
      </section>

      <section className="admin-badge-ledger" aria-labelledby="badge-ledger-title">
        <div className="admin-badge-ledger__head">
          <div>
            <div className="eyebrow">Definitions</div>
            <h2 id="badge-ledger-title">Badge ledger</h2>
          </div>
          <button className="btn btn-sm btn-outline" type="button" onClick={reevaluate} disabled={reevaluating}>
            {reevaluating ? "Running…" : "Re-run award engine"}
          </button>
        </div>

        {badges.length === 0 ? (
          <div className="admin-empty-state">No badge definitions exist.</div>
        ) : (
          <div className="admin-badge-list">
            {badges.map(badge => (
              <article className="admin-badge-row" key={badge.id}>
                <img src={badge.imageUrl} alt={`${badge.name} badge`} />
                <div className="admin-badge-row__copy">
                  <div className="admin-badge-row__title">
                    <strong>{badge.name}</strong>
                    <span className={`admin-state ${badge.isActive ? "is-live" : ""}`}>
                      {badge.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p>{badge.description}</p>
                  <small>{describeBadgeCondition(badge.conditionKind, badge.threshold)}</small>
                </div>
                <div className="admin-badge-row__count">
                  <strong>{badge.awardCount}</strong>
                  <span>{badge.awardCount === 1 ? "award" : "awards"}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
