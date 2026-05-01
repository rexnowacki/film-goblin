interface Props {
  title: string;
  heroBg?: "bone" | "void";
}

export default function LoadingShell({ title, heroBg = "bone" }: Props) {
  const isBone = heroBg === "bone";
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <section
        className={isBone ? "grain-light" : undefined}
        style={{
          background: isBone ? "var(--bone)" : "var(--void-2)",
          color: isBone ? "var(--void)" : "var(--bone)",
          borderBottom: "3px solid var(--void)",
          padding: "22px 0 18px",
        }}
      >
        <div className="container-wide">
          <h1 className="h-display" style={{ fontSize: "clamp(28px, 5vw, 64px)", opacity: 0.55 }}>
            {title}
          </h1>
        </div>
      </section>
      <div style={{ padding: "60px 0", textAlign: "center", fontFamily: "var(--font-serif)", fontStyle: "italic", opacity: 0.5 }}>
        Loading…
      </div>
    </div>
  );
}
