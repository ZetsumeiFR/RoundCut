"use client";

import type { DeliverableInput } from "@roundcut/api/deliverable";
import { PROJECT_MAX_DELIVERABLES } from "@roundcut/api/deliverable";
import type { Locale } from "@roundcut/auth/locale";
import { Button } from "@roundcut/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@roundcut/ui/components/empty";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@roundcut/ui/components/sheet";
import { useQueryClient } from "@tanstack/react-query";
import { ClapperboardIcon, XIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { AuthErrorAlert } from "@/components/auth/auth-error-alert";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";
import {
  DeliverableForm,
  DeliverableList,
  deliverableCountLabel,
} from "./deliverable-form";
import type { Project } from "./project-sheet";

type ProjectsMessages = Messages["projects"];

function DeliverablesPanel({
  locale,
  messages,
  project,
}: {
  locale: Locale;
  messages: ProjectsMessages;
  project: Project;
}) {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState(false);
  const { deliverables: deliverableMessages } = messages;
  const { deliverables } = project;
  const atLimit = deliverables.length >= PROJECT_MAX_DELIVERABLES;

  const handleAdd = useCallback(
    async (values: DeliverableInput) => {
      setSaveError(false);
      try {
        const created = await api.deliverable.create({
          ...values,
          projectId: project.id,
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.project.key(),
        });
        toast.success(
          formatMessage(deliverableMessages.saved, { title: created.title })
        );
        return true;
      } catch {
        setSaveError(true);
        return false;
      }
    },
    [deliverableMessages.saved, project.id, queryClient]
  );

  return (
    <>
      <SheetHeader className="gap-1 border-b px-5 py-4 pr-12">
        <SheetTitle className="truncate text-base">{project.name}</SheetTitle>
        <SheetDescription>
          {project.client.name} ·{" "}
          {deliverableCountLabel(
            deliverableMessages,
            locale,
            deliverables.length
          )}
        </SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        <p className="text-muted-foreground text-sm">
          {deliverableMessages.description}
        </p>
        {deliverables.length > 0 ? (
          <DeliverableList
            deliverables={deliverables}
            messages={deliverableMessages}
          />
        ) : (
          <Empty className="flex-none border border-dashed py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClapperboardIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{deliverableMessages.emptyTitle}</EmptyTitle>
              <EmptyDescription>
                {deliverableMessages.emptyDescription}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {saveError ? (
          <AuthErrorAlert
            message={deliverableMessages.saveError}
            title={deliverableMessages.saveError}
          />
        ) : null}
        <DeliverableForm
          limitMessage={
            atLimit
              ? formatMessage(deliverableMessages.errors.limit, {
                  max: PROJECT_MAX_DELIVERABLES,
                })
              : undefined
          }
          messages={deliverableMessages}
          onAdd={handleAdd}
        />
      </div>
    </>
  );
}

export function DeliverablesSheet({
  locale,
  messages,
  onOpenChange,
  project,
}: {
  locale: Locale;
  messages: ProjectsMessages;
  onOpenChange: (open: boolean) => void;
  project: Project | undefined;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(project)}>
      <SheetContent
        className="w-full gap-0 sm:max-w-md"
        showCloseButton={false}
      >
        {project ? (
          <DeliverablesPanel
            locale={locale}
            messages={messages}
            project={project}
          />
        ) : null}
        <SheetClose
          render={
            <Button
              className="absolute top-3 right-3"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <XIcon aria-hidden="true" />
          <span className="sr-only">{messages.close}</span>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
