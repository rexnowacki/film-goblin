import TopNavSkeleton from "@/components/skeletons/TopNavSkeleton";
import BottomNavSkeleton from "@/components/skeletons/BottomNavSkeleton";
import SkeletonFilmDetail from "@/components/skeletons/SkeletonFilmDetail";

export default function Loading() {
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNavSkeleton />
      <BottomNavSkeleton />
      <SkeletonFilmDetail />
    </div>
  );
}
