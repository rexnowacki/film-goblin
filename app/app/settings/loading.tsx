import TopNavSkeleton from "@/components/skeletons/TopNavSkeleton";
import BottomNavSkeleton from "@/components/skeletons/BottomNavSkeleton";

const FIELD_WIDTHS = [180, 220, 160, 200, 140];

export default function Loading() {
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNavSkeleton />
      <BottomNavSkeleton />
      <div className="container-wide" style={{ padding: 40 }}>
        <div className="skel" style={{ height: 44, width: 160, marginBottom: 32 }} />

        <div style={{ display: "grid", gap: 24, maxWidth: 560 }}>
          {FIELD_WIDTHS.map((labelW, i) => (
            <div key={i}>
              <div className="skel" style={{ height: 10, width: labelW, marginBottom: 8 }} />
              <div className="skel" style={{ height: 44, width: "100%" }} />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="skel" style={{ width: 18, height: 18 }} />
                <div className="skel" style={{ height: 10, width: 110 }} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 40 }}>
          <div className="skel" style={{ height: 11, width: 130, marginBottom: 6 }} />
          <div className="skel" style={{ height: 11, width: 240, marginBottom: 20 }} />
          {["Subgenre", "Tone", "Theme"].map(label => (
            <div key={label} style={{ marginBottom: 20 }}>
              <div className="skel" style={{ height: 9, width: 70, marginBottom: 10 }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[90, 120, 100, 140, 110, 80, 130].map((w, i) => (
                  <div key={i} className="skel" style={{ height: 30, width: w, borderRadius: 999 }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
