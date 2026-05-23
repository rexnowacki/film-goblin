"use client";

import Link from "next/link";
import Avatar from "@/components/Avatar";
import type { RitualMessage } from "@/lib/queries/ritual";

interface Props {
  message: RitualMessage;
  compact: boolean;
  isMe: boolean;
  highlighted?: boolean;
  failed?: boolean;
  canModerate?: boolean;
  onRetry?: () => void;
  onDelete?: () => void;
}

const MENTION_RE = /(?<![a-z0-9._])@([a-z0-9._]+)/gi;

export default function RitualMessageRow({
  message,
  compact,
  isMe,
  highlighted = false,
  failed = false,
  canModerate = false,
  onRetry,
  onDelete,
}: Props) {
  const ts = formatTime(message.created_at);
  return (
    <div
      data-message-id={message.id}
      style={{
        display: "flex",
        gap: 10,
        padding: compact ? "1px 18px" : "8px 18px 1px",
        marginTop: compact ? 0 : 4,
        background: highlighted
          ? "rgba(255,45,136,0.16)"
          : failed
            ? "rgba(217,58,46,0.08)"
            : isMe ? "rgba(255,45,136,0.04)" : "transparent",
        outline: highlighted ? "1px solid rgba(255,45,136,0.45)" : "none",
        transition: "background 180ms ease, outline-color 180ms ease",
      }}
    >
      <div style={{ width: 32, flexShrink: 0, paddingTop: compact ? 2 : 4 }}>
        {compact ? null : (
          <Link href={`/p/${encodeURIComponent(message.author.username)}`} style={{ display: "block", textDecoration: "none" }}>
            <Avatar
              name={message.author.username}
              color="var(--accent)"
              size={32}
              url={message.author.avatar_url}
            />
          </Link>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {!compact && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
            <Link
              href={`/p/${encodeURIComponent(message.author.username)}`}
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                fontWeight: 700,
                color: isMe ? "var(--accent)" : "var(--bone)",
                textDecoration: "none",
                letterSpacing: "0.01em",
              }}
            >
              {message.author.display_name || message.author.username}
            </Link>
            <span
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 10,
                color: "var(--muted)",
                letterSpacing: "0.06em",
              }}
              title={new Date(message.created_at).toLocaleString()}
            >
              {ts}
            </span>
            {canModerate && !failed && (
              <ModerationDeleteButton onDelete={onDelete} label="Delete" />
            )}
          </div>
        )}
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--bone)",
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
          }}
        >
          {renderBody(message.body)}
        </div>
        {compact && canModerate && !failed && (
          <div style={{ marginTop: 2 }}>
            <ModerationDeleteButton onDelete={onDelete} label={`Delete ${message.author.username}'s message`} />
          </div>
        )}
        {failed && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              marginTop: 4,
              padding: 0,
              border: 0,
              background: "transparent",
              color: "var(--danger, #d93a2e)",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            Failed to send. Retry
          </button>
        )}
      </div>
    </div>
  );
}

function ModerationDeleteButton({ onDelete, label }: { onDelete?: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onDelete}
      title="Delete ritual message"
      aria-label={label}
      style={{
        appearance: "none",
        border: 0,
        background: "transparent",
        color: "var(--blood, #d93a2e)",
        cursor: "pointer",
        fontFamily: "var(--font-ui)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        lineHeight: 1.3,
        padding: "2px 0",
        textTransform: "uppercase",
      }}
    >
      Delete
    </button>
  );
}

function renderBody(body: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  const re = new RegExp(MENTION_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > lastIndex) out.push(<span key={key++}>{body.slice(lastIndex, m.index)}</span>);
    const username = m[1];
    out.push(
      <Link
        key={key++}
        href={`/p/${encodeURIComponent(username.toLowerCase())}`}
        style={{
          color: "var(--accent)",
          fontWeight: 600,
          textDecoration: "none",
          background: "rgba(255,45,136,0.08)",
          padding: "0 3px",
          borderRadius: 2,
        }}
      >
        @{username}
      </Link>,
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < body.length) out.push(<span key={key++}>{body.slice(lastIndex)}</span>);
  return out;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}
