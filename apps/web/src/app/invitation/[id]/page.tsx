import { isAssignableRole } from "@roundcut/auth/team";
import { Button } from "@roundcut/ui/components/button";
import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { InvitationActions } from "@/components/account/invitation-actions";
import { AuthCard } from "@/components/auth/auth-card";
import { getLocale } from "@/i18n/get-locale";
import { formatMessage, getMessages } from "@/i18n/messages";
import { auth } from "@/services";

export default async function InvitationPage({
  params,
}: PageProps<"/invitation/[id]">) {
  const { id } = await params;
  const requestHeaders = await headers();
  const [session, locale] = await Promise.all([
    auth.api.getSession({ headers: requestHeaders }),
    getLocale(),
  ]);
  const { account, invitation: messages } = getMessages(locale);

  if (session?.user && !session.user.emailVerified) {
    redirect("/onboarding");
  }

  if (!session?.user) {
    return (
      <main className="flex w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
        <AuthCard
          description={messages.signedOutDescription}
          title={messages.signedOutTitle}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              render={<Link href="/login?view=sign-in" />}
            >
              {messages.signIn}
            </Button>
            <Button
              className="flex-1"
              render={<Link href="/login?view=sign-up" />}
              variant="outline"
            >
              {messages.signUp}
            </Button>
          </div>
        </AuthCard>
      </main>
    );
  }

  // Better-Auth only returns a pending, unexpired invitation sent to the
  // signed-in account's email address.
  const invitation = await auth.api
    .getInvitation({ headers: requestHeaders, query: { id } })
    .catch((error: unknown) => {
      if (error instanceof APIError) {
        return null;
      }
      throw error;
    });

  if (!(invitation && isAssignableRole(invitation.role))) {
    return (
      <main className="flex w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
        <AuthCard
          description={messages.invalidDescription}
          title={messages.invalidTitle}
        >
          <Button render={<Link href="/dashboard" />} variant="outline">
            {messages.toDashboard}
          </Button>
        </AuthCard>
      </main>
    );
  }

  return (
    <main className="flex w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
      <AuthCard
        description={formatMessage(messages.description, {
          inviter: invitation.inviterEmail,
          role: account.team.roles[invitation.role].toLowerCase(),
        })}
        title={formatMessage(messages.title, {
          studio: invitation.organizationName,
        })}
      >
        <InvitationActions
          afterAccept="/account/team"
          afterDecline="/dashboard"
          invitationId={invitation.id}
          messages={messages}
        />
      </AuthCard>
    </main>
  );
}
