import { Card, CardContent, CardHeader } from "@roundcut/ui/components/card";
import { Skeleton } from "@roundcut/ui/components/skeleton";

const SKELETON_ROWS = ["current", "other"] as const;

export default function SessionsLoading() {
  return (
    <Card aria-busy="true" className="w-full gap-0 p-0">
      <CardHeader className="gap-2 border-b px-6 py-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-6 px-6 py-6">
        {SKELETON_ROWS.map((row) => (
          <div className="flex items-center gap-3" key={row}>
            <Skeleton className="size-9" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
