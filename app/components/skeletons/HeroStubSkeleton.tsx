export default function HeroStubSkeleton() {
  return (
    <section
      style={{
        background: "var(--bone)",
        color: "var(--void)",
        borderBottom: "3px solid var(--void)",
        padding: "22px 0 18px",
      }}
      className="grain-light"
    >
      <div className="container-wide">
        <div
          className="skel"
          style={{
            height: "clamp(40px, 5vw, 72px)",
            width: "min(70%, 380px)",
            background: "rgba(10,10,10,0.10)",
          }}
        />
      </div>
    </section>
  );
}
