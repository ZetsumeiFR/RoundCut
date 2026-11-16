"use client";

import { ORPCError } from "@orpc/client";
import { REVIEWER_NAME_MAX_LENGTH } from "@roundcut/api/reviewer";
import { FieldGroup } from "@roundcut/ui/components/field";
import { useQueryClient } from "@tanstack/react-query";
import { UserRoundIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

import { AuthErrorAlert } from "@/components/auth/auth-error-alert";
import { useAppForm } from "@/components/auth/auth-form";
import { formatMessage, type Messages } from "@/i18n/messages";
import { client as api, orpc } from "@/utils/orpc";

type IdentityMessages = Messages["review"]["identity"];
type IdentifyError = "notAllowed" | "failed";

const isNotAllowed = (error: unknown) =>
  error instanceof ORPCError && error.code === "FORBIDDEN";

export function ReviewerIdentityForm({
  messages,
  token,
  workspaceName,
}: {
  messages: IdentityMessages;
  token: string;
  workspaceName: string;
}) {
  const queryClient = useQueryClient();
  const [identifyError, setIdentifyError] = useState<IdentifyError | null>(
    null
  );
  const schema = useMemo(
    () =>
      z.object({
        email: z.string().trim().pipe(z.email(messages.emailInvalid)),
        name: z
          .string()
          .trim()
          .min(1, messages.nameRequired)
          .max(REVIEWER_NAME_MAX_LENGTH),
      }),
    [messages.emailInvalid, messages.nameRequired]
  );

  const form = useAppForm({
    defaultValues: { email: "", name: "" },
    onSubmit: async ({ value }) => {
      setIdentifyError(null);
      try {
        await api.review.identify({ ...value, token });
        await queryClient.invalidateQueries({
          queryKey: orpc.review.resolveLink.key(),
        });
      } catch (error) {
        setIdentifyError(isNotAllowed(error) ? "notAllowed" : "failed");
      }
    },
    validators: { onSubmit: schema },
  });

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      form.handleSubmit();
    },
    [form]
  );

  return (
    <section
      aria-labelledby="reviewer-identity-title"
      className="flex w-full max-w-sm flex-col gap-4 border p-4 sm:p-6"
    >
      <div className="flex flex-col gap-2">
        <UserRoundIcon
          aria-hidden="true"
          className="size-5 text-muted-foreground"
        />
        <h2 className="font-semibold text-base" id="reviewer-identity-title">
          {messages.title}
        </h2>
        <p className="text-muted-foreground text-sm">
          {formatMessage(messages.description, { workspace: workspaceName })}
        </p>
      </div>
      <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
        <form.AppForm>
          <FieldGroup className="gap-4">
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  autoComplete="name"
                  label={messages.name}
                  maxLength={REVIEWER_NAME_MAX_LENGTH}
                />
              )}
            </form.AppField>
            <form.AppField name="email">
              {(field) => (
                <field.TextField
                  autoComplete="email"
                  inputMode="email"
                  label={messages.email}
                  type="email"
                />
              )}
            </form.AppField>
          </FieldGroup>
          {identifyError === "notAllowed" ? (
            <AuthErrorAlert
              message={messages.notAllowedDescription}
              title={messages.notAllowedTitle}
            />
          ) : null}
          {identifyError === "failed" ? (
            <AuthErrorAlert
              message={messages.errorDescription}
              title={messages.errorTitle}
            />
          ) : null}
          <form.SubmitButton
            label={messages.submit}
            pendingLabel={messages.submitting}
          />
        </form.AppForm>
      </form>
    </section>
  );
}
