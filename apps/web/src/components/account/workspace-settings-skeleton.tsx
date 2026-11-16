import { Card, CardContent, CardHeader } from "@roundcut/ui/components/card";
import { Skeleton } from "@roundcut/ui/components/skeleton";

const SKELETON_ROWS = [
  "name",
  "currency",
  "vat-rate",
  "language",
  "timezone",
] as const;

export function WorkspaceSettingsSkeleton() {
  return (
    <Card aria-busy="true" className="gap-0 p-0">
      <CardHeader className="gap-2 border-b px-5 py-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-6 px-5 py-5">
        {SKELETON_ROWS.map((row) => (
          <div
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            key={row}
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="h-8 w-full sm:w-72" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
