import { Card, CardContent, CardHeader } from "@roundcut/ui/components/card";
import { Skeleton } from "@roundcut/ui/components/skeleton";

export default function SecurityLoading() {
  return (
    <Card aria-busy="true" className="w-full gap-0 p-0">
      <CardHeader className="gap-2 border-b px-6 py-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-5 px-6 py-6">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-9 w-24 self-end" />
      </CardContent>
    </Card>
  );
}
