"use client";

import { ASSIGNABLE_ROLES, type AssignableRole } from "@roundcut/auth/team";
import { Button } from "@roundcut/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@roundcut/ui/components/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@roundcut/ui/components/field";
import { Input } from "@roundcut/ui/components/input";
import { Badge } from "@roundcut/ui/components/reui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@roundcut/ui/components/select";
import { UserPlusIcon } from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import z from "zod";

import { AuthErrorAlert } from "@/components/auth/auth-error-alert";
import { formatMessage, type Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

type TeamMessages = Messages["account"]["team"];

const emailSchema = z.email();

const INVITE_ERROR_KEYS: Record<string, keyof TeamMessages["inviteErrors"]> = {
  INVITATION_LIMIT_REACHED: "seatsFull",
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "seatsFull",
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "alreadyMember",
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "alreadyInvited",
};

const inviteErrorMessage = (
  code: string | undefined,
  messages: TeamMessages
) => {
  const key = code ? INVITE_ERROR_KEYS[code] : undefined;
  return key ? messages.inviteErrors[key] : messages.actionError;
};

function RolePicker({
  messages,
  onRoleChange,
  role,
}: {
  messages: TeamMessages;
  onRoleChange: (role: AssignableRole) => void;
  role: AssignableRole;
}) {
  const handleValueChange = useCallback(
    (value: AssignableRole | null) => {
      if (value) {
        onRoleChange(value);
      }
    },
    [onRoleChange]
  );

  return (
    <Select onValueChange={handleValueChange} value={role}>
      <SelectTrigger className="w-full" id="invite-role">
        <SelectValue>{messages.roles[role]}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          {ASSIGNABLE_ROLES.map((option) => (
            <SelectItem
              className="h-auto items-start py-2"
              key={option}
              value={option}
            >
              <div className="flex min-w-0 flex-col pr-5 text-left">
                <span>{messages.roles[option]}</span>
                <span className="text-muted-foreground">
                  {messages.roleDescriptions[option]}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function InviteMemberDialog({
  messages,
  onInvited,
  seatsLeft,
  studioId,
}: {
  messages: TeamMessages;
  onInvited: (email: string) => Promise<void>;
  seatsLeft: number;
  studioId: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("editor");
  const [emailError, setEmailError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const dialogMessages = messages.inviteDialog;

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setEmail("");
      setRole("editor");
      setEmailError(false);
      setSubmitError(null);
    }
  }, []);

  const handleEmailChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setEmail(event.target.value);
      setEmailError(false);
    },
    []
  );

  const handleCancel = useCallback(
    () => handleOpenChange(false),
    [handleOpenChange]
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const recipient = email.trim().toLowerCase();
      if (!emailSchema.safeParse(recipient).success) {
        setEmailError(true);
        return;
      }
      setIsSending(true);
      setSubmitError(null);
      try {
        const { error } = await authClient.organization.inviteMember({
          email: recipient,
          organizationId: studioId,
          role,
        });
        if (error) {
          setSubmitError(inviteErrorMessage(error.code, messages));
          return;
        }
        await onInvited(recipient);
        handleOpenChange(false);
      } finally {
        setIsSending(false);
      }
    },
    [email, handleOpenChange, messages, onInvited, role, studioId]
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger disabled={seatsLeft <= 0} render={<Button />}>
        <UserPlusIcon aria-hidden="true" data-icon="inline-start" />
        {messages.invite}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={handleSubmit}
        >
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>{dialogMessages.title}</DialogTitle>
              <Badge size="sm" variant="info-light">
                {formatMessage(dialogMessages.seatsLeft, { count: seatsLeft })}
              </Badge>
            </div>
            <DialogDescription>{dialogMessages.description}</DialogDescription>
          </DialogHeader>
          {submitError ? (
            <AuthErrorAlert
              message={submitError}
              title={messages.actionError}
            />
          ) : null}
          <FieldGroup className="gap-4 py-1">
            <Field data-invalid={emailError}>
              <FieldLabel htmlFor="invite-email">
                {dialogMessages.email}
              </FieldLabel>
              <Input
                aria-invalid={emailError}
                autoComplete="off"
                id="invite-email"
                name="email"
                onChange={handleEmailChange}
                placeholder={dialogMessages.emailPlaceholder}
                type="email"
                value={email}
              />
              {emailError ? (
                <FieldError>{dialogMessages.emailInvalid}</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-role">
                {dialogMessages.role}
              </FieldLabel>
              <RolePicker
                messages={messages}
                onRoleChange={setRole}
                role={role}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button onClick={handleCancel} type="button" variant="outline">
              {messages.cancel}
            </Button>
            <Button disabled={isSending} type="submit">
              {isSending ? dialogMessages.sending : dialogMessages.send}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
