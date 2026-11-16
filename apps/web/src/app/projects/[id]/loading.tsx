import { ProjectViewSkeleton } from "@/components/projects/project-view";

export default function ProjectLoading() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <ProjectViewSkeleton />
    </main>
  );
}
