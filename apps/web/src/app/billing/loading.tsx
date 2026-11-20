import { ClientsSkeleton } from "@/components/clients/clients-view";

export default function BillingLoading() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <div className="border">
        <ClientsSkeleton />
      </div>
    </main>
  );
}
