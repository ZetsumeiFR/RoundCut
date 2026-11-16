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

import { type EmailConfig, sendEmail, verificationEmail } from "./email";
import { resolveLocale } from "./locale";
import { MIN_PASSWORD_LENGTH } from "./password-policy";

export type AuthConfig = EmailConfig & {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
};

export function createAuth(env: AuthConfig, database: Database) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: { account, authRelations, session, user, verification },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: MIN_PASSWORD_LENGTH },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user: newUser, url }, request) => {
        const locale = resolveLocale(request?.headers.get("accept-language"));
        await sendEmail(env, verificationEmail(locale, newUser.email, url));
      },
    },
    plugins: [nextCookies()],
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
