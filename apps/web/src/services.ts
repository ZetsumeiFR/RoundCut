import { createAuth } from "@roundcut/auth";
import { createDb } from "@roundcut/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
