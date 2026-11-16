import { Card, CardContent, CardHeader } from "@roundcut/ui/components/card";
import type { ReactNode } from "react";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex w-full max-w-[26rem] flex-col gap-5">
      <Card className="w-full gap-0 overflow-hidden p-0 shadow-sm">
        <CardHeader className="flex flex-col items-center gap-4 px-6 pt-8 pb-0 text-center sm:px-8 sm:pt-9">
          <div
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center bg-primary font-semibold text-primary-foreground text-sm"
          >
            R
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-balance font-semibold text-xl">{title}</h1>
            <p className="text-pretty text-muted-foreground text-sm">
              {description}
            </p>
          </div>
        </CardHeader>
        {children ? (
          <CardContent className="flex flex-col gap-6 px-6 pt-6 pb-6 sm:px-8 sm:pt-7 sm:pb-8">
            {children}
          </CardContent>
        ) : (
          <div className="pb-8 sm:pb-9" />
        )}
      </Card>
      {footer ? (
        <p className="text-center text-muted-foreground text-sm">{footer}</p>
      ) : null}
    </div>
  );
}
