export default function BottomNavSkeleton() {
  return (
    <nav className="bottom-nav" aria-hidden="true">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bottom-nav__item" style={{ pointerEvents: "none" }}>
          <div className="skel" style={{ width: 26, height: 26, borderRadius: 4 }} />
          <div className="skel" style={{ width: 38, height: 8, marginTop: 4 }} />
        </div>
      ))}
    </nav>
  );
}
