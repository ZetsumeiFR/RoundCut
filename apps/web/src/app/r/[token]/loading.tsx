import { ClientReviewSkeleton } from "@/components/review/client-review-view";

export default function ClientReviewLoading() {
  return (
    <main className="mx-auto flex min-h-svh w-full min-w-0 max-w-4xl flex-col gap-4 px-4 py-4 sm:px-8 sm:py-8">
      <ClientReviewSkeleton />
    </main>
  );
}
