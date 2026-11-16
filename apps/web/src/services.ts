import type { ReviewerCookieOptions } from "@roundcut/api/reviewer";
import { createStorage } from "@roundcut/api/storage";
import { createAuth } from "@roundcut/auth";
import { createDb } from "@roundcut/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
export const storage = createStorage(ENV);
export const reviewerCookieOptions = {
  secret: ENV.BETTER_AUTH_SECRET,
  secure: ENV.BETTER_AUTH_URL.startsWith("https://"),
} satisfies ReviewerCookieOptions;
