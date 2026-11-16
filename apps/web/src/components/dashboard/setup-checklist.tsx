import { Button } from "@roundcut/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@roundcut/ui/components/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@roundcut/ui/components/progress";
import { Badge } from "@roundcut/ui/components/reui/badge";
import { CircleCheckIcon, CircleIcon } from "lucide-react";
import Link from "next/link";

import { formatMessage, type Messages } from "@/i18n/messages";

type ChecklistMessages = Messages["dashboard"]["checklist"];

interface ChecklistItem {
  action?: { href: "/clients" | "/onboarding"; label: string };
  description: string;
  done: boolean;
  id: string;
  title: string;
}

const PERCENT = 100;

function ChecklistStatus({
  item,
  messages,
}: {
  item: ChecklistItem;
  messages: ChecklistMessages;
}) {
  if (item.done) {
    return (
      <Badge size="lg" variant="success-light">
        {messages.done}
      </Badge>
    );
  }
  if (!item.action) {
    return (
      <Badge size="lg" variant="outline">
        {messages.soon}
      </Badge>
    );
  }
  return (
    <Button
      nativeButton={false}
      render={<Link href={item.action.href} />}
      size="sm"
      variant="outline"
    >
      {item.action.label}
    </Button>
  );
}

// Stays on the dashboard until the first review link is sent (WS-03).
// Projects and review links don't exist yet, so those steps can't be done.
export function SetupChecklist({
  hasClient,
  messages,
  setupDone,
}: {
  hasClient: boolean;
  messages: ChecklistMessages;
  setupDone: boolean;
}) {
  const items: ChecklistItem[] = [
    {
      action: { href: "/onboarding", label: messages.setupAction },
      description: messages.setupDescription,
      done: setupDone,
      id: "setup",
      title: messages.setup,
    },
    {
      action: { href: "/clients", label: messages.firstClientAction },
      description: messages.firstClientDescription,
      done: hasClient,
      id: "first-client",
      title: messages.firstClient,
    },
    {
      description: messages.firstProjectDescription,
      done: false,
      id: "first-project",
      title: messages.firstProject,
    },
    {
      description: messages.firstLinkDescription,
      done: false,
      id: "first-link",
      title: messages.firstLink,
    },
  ];
  const doneCount = items.filter((item) => item.done).length;

  return (
    <Card className="gap-0 p-0">
      <CardHeader className="gap-3 border-b px-5 py-4">
        <div className="flex flex-col gap-1">
          <CardTitle>{messages.title}</CardTitle>
          <CardDescription>{messages.description}</CardDescription>
        </div>
        <Progress value={(doneCount / items.length) * PERCENT}>
          <ProgressLabel className="text-muted-foreground">
            {formatMessage(messages.progress, {
              done: doneCount,
              total: items.length,
            })}
          </ProgressLabel>
          <ProgressValue />
        </Progress>
      </CardHeader>
      <CardContent className="p-0">
        <ol className="flex flex-col">
          {items.map((item) => (
            <li
              className="flex flex-col gap-3 border-b px-5 py-4 last:border-b-0 sm:flex-row sm:items-center"
              key={item.id}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {item.done ? (
                  <CircleCheckIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-success"
                  />
                ) : (
                  <CircleIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {item.description}
                  </p>
                </div>
              </div>
              <div className="pl-7 sm:pl-0">
                <ChecklistStatus item={item} messages={messages} />
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
