import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@roundcut/db";
import {
  account,
  authRelations,
  session,
  user,
  verification,
} from "@roundcut/db/schema/auth";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import {
  type EmailConfig,
  resetPasswordEmail,
  sendEmail,
  verificationEmail,
} from "./email";
import { resolveLocale } from "./locale";
import { MIN_PASSWORD_LENGTH } from "./password-policy";

interface GoogleConfig {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export type AuthConfig = EmailConfig &
  GoogleConfig & {
    BETTER_AUTH_URL: string;
    BETTER_AUTH_SECRET: string;
  };

// Google sign-in is offered only once both OAuth credentials are configured.
export const isGoogleSignInEnabled = (env: GoogleConfig) =>
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

const googleProvider = ({
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
}: GoogleConfig) =>
  GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
          prompt: "select_account" as const,
        },
      }
    : {};

export function createAuth(env: AuthConfig, database: Database) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: { account, authRelations, session, user, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      requireEmailVerification: true,
      // A password reset signs the account out everywhere.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user: resetUser, url }, request) => {
        const locale = resolveLocale(request?.headers.get("accept-language"));
        await sendEmail(env, resetPasswordEmail(locale, resetUser.email, url));
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignIn: true,
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user: newUser, url }, request) => {
        const locale = resolveLocale(request?.headers.get("accept-language"));
        await sendEmail(env, verificationEmail(locale, newUser.email, url));
      },
    },
    plugins: [nextCookies()],
    secret: env.BETTER_AUTH_SECRET,
    socialProviders: googleProvider(env),
    trustedOrigins: [env.BETTER_AUTH_URL],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
