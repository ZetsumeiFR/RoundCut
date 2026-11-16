"use client";

import type { AppRouterClient } from "@roundcut/api/routers/index";
import type { Locale } from "@roundcut/auth/locale";
import {
  ASSIGNABLE_ROLES,
  isAssignableRole,
  type TeamRole,
} from "@roundcut/auth/team";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@roundcut/ui/components/alert-dialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@roundcut/ui/components/avatar";
import { Button } from "@roundcut/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@roundcut/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@roundcut/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@roundcut/ui/components/empty";
import { Badge, type BadgeProps } from "@roundcut/ui/components/reui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@roundcut/ui/components/select";
import { Separator } from "@roundcut/ui/components/separator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EllipsisIcon, LogOutIcon, MailIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { formatMessage, type Messages } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import { InvitationActions } from "./invitation-actions";
import { InviteMemberDialog } from "./invite-member-dialog";
import { SettingsLoadError } from "./settings-form";
import { TeamSkeleton } from "./team-skeleton";

type TeamMessages = Messages["account"]["team"];
type Team = Awaited<ReturnType<AppRouterClient["team"]["get"]>>;
type TeamMember = Team["members"][number];
type AuthResult = Promise<{ error: unknown }>;

const ROLE_BADGES: Record<TeamRole, BadgeProps["variant"]> = {
  editor: "info-light",
  owner: "primary-light",
  viewer: "invert-light",
};

const WHITESPACE = /\s+/;

const initials = (name: string) =>
  name
    .split(WHITESPACE)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

function useTeamAction(messages: TeamMessages) {
  const queryClient = useQueryClient();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: orpc.team.get.queryKey() }),
    [queryClient]
  );

  const run = useCallback(
    async (key: string, action: () => AuthResult, success?: string) => {
      setPendingKey(key);
      try {
        const { error } = await action();
        if (error) {
          toast.error(messages.actionError);
          return false;
        }
        await refresh();
        if (success) {
          toast.success(success);
        }
        return true;
      } finally {
        setPendingKey(null);
      }
    },
    [messages.actionError, refresh]
  );

  return { pendingKey, refresh, run };
}

function RoleBadge({
  messages,
  role,
}: {
  messages: TeamMessages;
  role: TeamRole;
}) {
  return <Badge variant={ROLE_BADGES[role]}>{messages.roles[role]}</Badge>;
}

function MemberActions({
  busy,
  member,
  messages,
  onChangeRole,
  onRemove,
}: {
  busy: boolean;
  member: TeamMember;
  messages: TeamMessages;
  onChangeRole: (member: TeamMember, role: TeamRole) => void;
  onRemove: (member: TeamMember) => void;
}) {
  const handleRoleChange = useCallback(
    (role: string) => {
      if (isAssignableRole(role) && role !== member.role) {
        onChangeRole(member, role);
      }
    },
    [member, onChangeRole]
  );
  const handleRemove = useCallback(() => onRemove(member), [member, onRemove]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={formatMessage(messages.memberActions, {
          name: member.name,
        })}
        disabled={busy}
        render={<Button size="icon-sm" variant="ghost" />}
      >
        <EllipsisIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{messages.role}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={handleRoleChange}
            value={member.role}
          >
            {ASSIGNABLE_ROLES.map((role) => (
              <DropdownMenuRadioItem key={role} value={role}>
                {messages.roles[role]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleRemove} variant="destructive">
          {messages.remove}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MemberRow({
  busy,
  formatDate,
  isSelf,
  manageable,
  member,
  messages,
  onChangeRole,
  onRemove,
}: {
  busy: boolean;
  formatDate: (date: Date) => string;
  isSelf: boolean;
  manageable: boolean;
  member: TeamMember;
  messages: TeamMessages;
  onChangeRole: (member: TeamMember, role: TeamRole) => void;
  onRemove: (member: TeamMember) => void;
}) {
  return (
    <li className="flex items-center gap-3">
      <Avatar>
        {member.image ? <AvatarImage alt="" src={member.image} /> : null}
        <AvatarFallback>{initials(member.name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-sm">{member.name}</span>
          {isSelf ? (
            <Badge variant="success-light">{messages.you}</Badge>
          ) : null}
        </div>
        <p className="truncate text-muted-foreground text-xs">
          {member.email} ·{" "}
          {formatMessage(messages.joined, {
            date: formatDate(member.joinedAt),
          })}
        </p>
      </div>
      <RoleBadge messages={messages} role={member.role} />
      {manageable ? (
        <MemberActions
          busy={busy}
          member={member}
          messages={messages}
          onChangeRole={onChangeRole}
          onRemove={onRemove}
        />
      ) : null}
    </li>
  );
}

function PendingInvitations({
  busyKey,
  formatDate,
  invitations,
  messages,
  onRevoke,
}: {
  busyKey: string | null;
  formatDate: (date: Date) => string;
  invitations: Team["invitations"];
  messages: TeamMessages;
  onRevoke: (invitationId: string) => void;
}) {
  return (
    <section
      aria-labelledby="pending-invitations-title"
      className="flex flex-col gap-4"
    >
      <h2 className="font-medium text-sm" id="pending-invitations-title">
        {messages.pendingTitle}
      </h2>
      {invitations.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {invitations.map((invitation) => (
            <PendingInvitationRow
              busy={busyKey === invitation.id}
              formatDate={formatDate}
              invitation={invitation}
              key={invitation.id}
              messages={messages}
              onRevoke={onRevoke}
            />
          ))}
        </ul>
      ) : (
        <Empty className="border p-6 md:p-8">
          <EmptyHeader>
            <EmptyTitle>{messages.pendingEmptyTitle}</EmptyTitle>
            <EmptyDescription>
              {messages.pendingEmptyDescription}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}

function PendingInvitationRow({
  busy,
  formatDate,
  invitation,
  messages,
  onRevoke,
}: {
  busy: boolean;
  formatDate: (date: Date) => string;
  invitation: Team["invitations"][number];
  messages: TeamMessages;
  onRevoke: (invitationId: string) => void;
}) {
  const revoke = useCallback(
    () => onRevoke(invitation.id),
    [invitation.id, onRevoke]
  );

  return (
    <li className="flex items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MailIcon aria-hidden="true" className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-sm">{invitation.email}</span>
        <p className="text-muted-foreground text-xs">
          {formatMessage(messages.expires, {
            date: formatDate(invitation.expiresAt),
          })}
        </p>
      </div>
      <RoleBadge messages={messages} role={invitation.role} />
      <Button disabled={busy} onClick={revoke} size="sm" variant="outline">
        {messages.revoke}
      </Button>
    </li>
  );
}

function ReceivedInvitations({
  messages,
  received,
}: {
  messages: TeamMessages;
  received: Team["received"];
}) {
  return (
    <section
      aria-labelledby="received-invitations-title"
      className="flex flex-col gap-3 border bg-muted/40 p-4"
    >
      <h2 className="font-medium text-sm" id="received-invitations-title">
        {messages.receivedTitle}
      </h2>
      <ul className="flex flex-col gap-3">
        {received.map((invitation) => (
          <li
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            key={invitation.id}
          >
            <p className="text-sm">
              {formatMessage(messages.receivedItem, {
                inviter: invitation.inviterName,
                role: messages.roles[invitation.role].toLowerCase(),
                studio: invitation.studioName,
              })}
            </p>
            <InvitationActions
              invitationId={invitation.id}
              messages={messages}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StudioSwitcher({
  current,
  messages,
  onSwitch,
  studios,
}: {
  current: string;
  messages: TeamMessages;
  onSwitch: (studioId: string) => void;
  studios: Team["studios"];
}) {
  const handleValueChange = useCallback(
    (value: string | null) => {
      if (value && value !== current) {
        onSwitch(value);
      }
    },
    [current, onSwitch]
  );
  const selected = studios.find((studio) => studio.id === current);

  return (
    <Select onValueChange={handleValueChange} value={current}>
      <SelectTrigger aria-label={messages.studio} className="w-full sm:w-56">
        <SelectValue>{selected?.name}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {studios.map((studio) => (
            <SelectItem key={studio.id} value={studio.id}>
              {studio.name} · {messages.roles[studio.role]}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ConfirmDialog({
  busy,
  busyLabel,
  confirmLabel,
  description,
  messages,
  onConfirm,
  onOpenChange,
  open,
  title,
}: {
  busy: boolean;
  busyLabel: string;
  confirmLabel: string;
  description: string;
  messages: TeamMessages;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  const confirmText = busy ? busyLabel : confirmLabel;

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{messages.cancel}</AlertDialogCancel>
          <Button disabled={busy} onClick={onConfirm} variant="destructive">
            {confirmText}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const LEAVE = "leave";
const SWITCH = "switch";

function TeamCard({
  locale,
  messages,
  team,
  userId,
}: {
  locale: Locale;
  messages: TeamMessages;
  team: Team;
  userId: string;
}) {
  const { pendingKey, refresh, run } = useTeamAction(messages);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [leaving, setLeaving] = useState(false);
  const isOwner = team.role === "owner";
  const used = team.members.length + team.invitations.length;
  const seatsLeft = team.seats - used;
  const formatDate = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format,
    [locale]
  );

  const changeRole = useCallback(
    (member: TeamMember, role: TeamRole) =>
      run(
        member.id,
        () =>
          authClient.organization.updateMemberRole({
            memberId: member.id,
            organizationId: team.id,
            role,
          }),
        messages.roleUpdated
      ),
    [messages.roleUpdated, run, team.id]
  );

  const confirmRemove = useCallback(async () => {
    if (!removing) {
      return;
    }
    const removed = await run(
      removing.id,
      () =>
        authClient.organization.removeMember({
          memberIdOrEmail: removing.id,
          organizationId: team.id,
        }),
      messages.memberRemoved
    );
    if (removed) {
      setRemoving(null);
    }
  }, [messages.memberRemoved, removing, run, team.id]);

  const handleRemoveOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setRemoving(null);
    }
  }, []);

  const revoke = useCallback(
    (invitationId: string) =>
      run(
        invitationId,
        () => authClient.organization.cancelInvitation({ invitationId }),
        messages.invitationRevoked
      ),
    [messages.invitationRevoked, run]
  );

  const confirmLeave = useCallback(async () => {
    const left = await run(
      LEAVE,
      () => authClient.organization.leave({ organizationId: team.id }),
      messages.left
    );
    if (left) {
      setLeaving(false);
    }
  }, [messages.left, run, team.id]);

  const openLeave = useCallback(() => setLeaving(true), []);

  const switchStudio = useCallback(
    (organizationId: string) =>
      run(SWITCH, () => authClient.organization.setActive({ organizationId })),
    [run]
  );

  const onInvited = useCallback(
    async (email: string) => {
      await refresh();
      toast.success(formatMessage(messages.invitationSent, { email }));
    },
    [messages.invitationSent, refresh]
  );

  return (
    <Card className="w-full gap-0 p-0">
      <CardHeader className="gap-1.5 border-b px-6 py-6">
        <CardTitle>
          <h1 className="font-semibold text-xl">
            {messages.title} · {team.name}
          </h1>
        </CardTitle>
        <CardDescription className="text-sm">
          {isOwner
            ? formatMessage(messages.description, { seats: team.seats })
            : formatMessage(messages.memberDescription, {
                role: messages.roles[team.role].toLowerCase(),
              })}
        </CardDescription>
        {isOwner ? (
          <CardAction>
            <InviteMemberDialog
              messages={messages}
              onInvited={onInvited}
              seatsLeft={seatsLeft}
              studioId={team.id}
            />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-6 px-6 py-6">
        {team.received.length > 0 ? (
          <ReceivedInvitations messages={messages} received={team.received} />
        ) : null}
        {team.studios.length > 1 ? (
          <StudioSwitcher
            current={team.id}
            messages={messages}
            onSwitch={switchStudio}
            studios={team.studios}
          />
        ) : null}
        <section
          aria-labelledby="team-members-title"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium text-sm" id="team-members-title">
              {messages.membersTitle}
            </h2>
            {isOwner ? (
              <Badge
                variant={seatsLeft > 0 ? "success-light" : "warning-light"}
              >
                {formatMessage(messages.seats, { total: team.seats, used })}
              </Badge>
            ) : null}
          </div>
          {isOwner && seatsLeft <= 0 ? (
            <p className="text-muted-foreground text-xs">
              {messages.seatsFull}
            </p>
          ) : null}
          <ul className="flex flex-col gap-4">
            {team.members.map((member) => (
              <MemberRow
                busy={pendingKey === member.id}
                formatDate={formatDate}
                isSelf={member.userId === userId}
                key={member.id}
                manageable={isOwner && member.role !== "owner"}
                member={member}
                messages={messages}
                onChangeRole={changeRole}
                onRemove={setRemoving}
              />
            ))}
          </ul>
        </section>
        {isOwner ? (
          <>
            <Separator />
            <PendingInvitations
              busyKey={pendingKey}
              formatDate={formatDate}
              invitations={team.invitations}
              messages={messages}
              onRevoke={revoke}
            />
          </>
        ) : (
          <>
            <Separator />
            <div>
              <Button onClick={openLeave} variant="outline">
                <LogOutIcon aria-hidden="true" data-icon="inline-start" />
                {messages.leave}
              </Button>
            </div>
          </>
        )}
      </CardContent>
      <ConfirmDialog
        busy={removing !== null && pendingKey === removing.id}
        busyLabel={messages.removing}
        confirmLabel={messages.remove}
        description={messages.removeDescription}
        messages={messages}
        onConfirm={confirmRemove}
        onOpenChange={handleRemoveOpenChange}
        open={removing !== null}
        title={formatMessage(messages.removeTitle, {
          name: removing?.name ?? "",
        })}
      />
      <ConfirmDialog
        busy={pendingKey === LEAVE}
        busyLabel={messages.leaving}
        confirmLabel={messages.leave}
        description={messages.leaveDescription}
        messages={messages}
        onConfirm={confirmLeave}
        onOpenChange={setLeaving}
        open={leaving}
        title={formatMessage(messages.leaveTitle, { studio: team.name })}
      />
    </Card>
  );
}

export function TeamSettings({
  locale,
  messages,
  userId,
}: {
  locale: Locale;
  messages: TeamMessages;
  userId: string;
}) {
  const { data, isError, refetch } = useQuery(orpc.team.get.queryOptions());
  const handleRetry = useCallback(() => refetch(), [refetch]);

  if (data) {
    return (
      <TeamCard
        locale={locale}
        messages={messages}
        team={data}
        userId={userId}
      />
    );
  }

  if (isError) {
    return <SettingsLoadError messages={messages} onRetry={handleRetry} />;
  }

  return <TeamSkeleton />;
}
