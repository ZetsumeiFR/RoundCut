import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  type ActiveSession,
  ActiveSessions,
} from "@/components/account/active-sessions";
import { parseSessionDevice } from "@/components/account/session-device";
import { StaleSession } from "@/components/account/stale-session";
import { getLocale } from "@/i18n/get-locale";
import { formatMessage, getMessages, type Messages } from "@/i18n/messages";
import { auth } from "@/services";

type ListedSession = Awaited<ReturnType<typeof auth.api.listSessions>>[number];

// Better-Auth refuses to list sessions once the current one is older than
// session.freshAge (1 day by default): the user must sign in again.
const isStaleSessionError = (error: unknown) =>
  error instanceof APIError && error.body?.code === "SESSION_NOT_FRESH";

function toActiveSession(
  session: ListedSession,
  messages: Messages["account"]["sessions"],
  formatDate: (date: Date) => string
): ActiveSession {
  const { browser, mobile, os } = parseSessionDevice(session.userAgent);
  const device =
    browser || os
      ? `${browser ?? messages.unknownBrowser} · ${os ?? messages.unknownDevice}`
      : messages.unknownDevice;

  return {
    details: [
      formatMessage(messages.ipAddress, {
        ip: session.ipAddress || messages.unknownIp,
      }),
      formatMessage(messages.createdAt, {
        date: formatDate(new Date(session.createdAt)),
      }),
      formatMessage(messages.lastActive, {
        date: formatDate(new Date(session.updatedAt)),
      }),
    ],
    device,
    mobile,
    token: session.token,
  };
}

export default async function SessionsPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
    redirect("/login?view=sign-in");
  }
  if (!session.user.emailVerified) {
    redirect("/onboarding");
  }

  const locale = await getLocale();
  const messages = getMessages(locale);
  const sessionMessages = messages.account.sessions;

  let sessions: ListedSession[];
  try {
    sessions = await auth.api.listSessions({ headers: requestHeaders });
  } catch (error) {
    if (!isStaleSessionError(error)) {
      throw error;
    }
    return (
      <main className="flex w-full items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
        <StaleSession messages={sessionMessages} />
      </main>
    );
  }

  const { format } = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const toRow = (listed: ListedSession) =>
    toActiveSession(listed, sessionMessages, format);
  const currentToken = session.session.token;
  const current = sessions.find(({ token }) => token === currentToken);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col px-4 py-6 sm:px-8 sm:py-10">
      <ActiveSessions
        current={toRow(current ?? session.session)}
        errors={messages.auth.errors}
        messages={sessionMessages}
        others={sessions
          .filter(({ token }) => token !== currentToken)
          .toSorted(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
          .map(toRow)}
      />
    </main>
  );
}
