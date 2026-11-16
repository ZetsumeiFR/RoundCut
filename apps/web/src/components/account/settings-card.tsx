import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@roundcut/ui/components/card";
import type { ReactNode } from "react";

export function SettingsCard({
  children,
  description,
  footer,
  title,
}: {
  children: ReactNode;
  description?: string;
  footer?: ReactNode;
  title: string;
}) {
  return (
    <Card className="gap-0 p-0">
      <CardHeader className="gap-0 border-b px-5 py-3">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
      {footer ? (
        <CardFooter className="justify-end gap-2 border-t px-5 py-3">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}
