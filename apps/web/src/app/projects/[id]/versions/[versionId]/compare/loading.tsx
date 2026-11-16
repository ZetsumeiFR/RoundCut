import { CompareViewSkeleton } from "@/components/review/compare-view";

export default function VersionCompareLoading() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4 px-4 py-4 sm:px-8 sm:py-6">
      <CompareViewSkeleton />
    </main>
  );
}
