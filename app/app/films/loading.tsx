import TopNavSkeleton from "@/components/skeletons/TopNavSkeleton";
import BottomNavSkeleton from "@/components/skeletons/BottomNavSkeleton";
import SkeletonGrid from "@/components/skeletons/SkeletonGrid";

export default function Loading() {
  return (
    <div style={{ background: "var(--void)", color: "var(--bone)", minHeight: "100dvh" }}>
      <TopNavSkeleton />
      <BottomNavSkeleton />
      <SkeletonGrid showSearch showSortChips />
    </div>
  );
}
