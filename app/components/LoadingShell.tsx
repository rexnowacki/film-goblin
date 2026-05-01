import Image from "next/image";

export default function LoadingShell() {
  return (
    <div
      style={{
        background: "var(--void)",
        color: "var(--bone)",
        minHeight: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        padding: "env(safe-area-inset-top) 24px env(safe-area-inset-bottom)",
      }}
    >
      <Image
        src="/fg-loader.webp"
        alt="Film Goblin"
        width={420}
        height={638}
        priority
        style={{ width: "min(76vw, 420px)", height: "auto", display: "block" }}
      />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div className="caps" style={{ fontSize: 14, color: "var(--bone)", letterSpacing: "0.16em" }}>
          Loading…
        </div>
        <div className="loading-frames" aria-hidden="true">
          <span className="loading-frame" />
          <span className="loading-frame" />
          <span className="loading-frame" />
        </div>
      </div>
    </div>
  );
}
