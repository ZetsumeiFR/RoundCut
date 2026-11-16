import { createHash } from "node:crypto";
import { LOCALES } from "@roundcut/auth/locale";
import {
  CONSENT_SHOWN_LINE_MAX_LENGTH,
  CONSENT_SHOWN_MAX_LINES,
} from "@roundcut/db/consent";
import z from "zod";

// What the client saw when agreeing (EXTRA-03): the page's language and the
// lines of the offer as displayed, in order.
export const consentShownSchema = z.object({
  lines: z
    .array(z.string().trim().min(1).max(CONSENT_SHOWN_LINE_MAX_LENGTH))
    .min(1)
    .max(CONSENT_SHOWN_MAX_LINES),
  locale: z.enum(LOCALES),
});

export type ConsentShown = z.infer<typeof consentShownSchema>;

type Json = boolean | number | string | null | Json[] | { [key: string]: Json };

// JSON with object keys sorted at every level, so a snapshot read back from
// jsonb (which reorders keys) hashes to the same value.
export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson(value[key] ?? null)}`
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export const snapshotHash = (snapshot: Json) =>
  createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
