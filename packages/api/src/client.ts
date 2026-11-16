import z from "zod";

import { revisionTermsSchema } from "./workspace";

export const CLIENT_NAME_MAX_LENGTH = 120;
export const CLIENT_ADDRESS_MAX_LENGTH = 300;
export const CLIENT_NOTES_MAX_LENGTH = 2000;
export const CLIENT_REVIEWERS_MAX = 20;

const SIREN_PATTERN = /^\d{9}$/;
const WHITESPACE = /\s+/g;
const EMAIL_LIST_SEPARATOR = /[\s,;]+/;

export const normalizeSiren = (value: string) => value.replace(WHITESPACE, "");

export const isSiren = (value: string) => SIREN_PATTERN.test(value);

// Reviewer emails are typed as free text (one per line, or separated by
// commas or semicolons) and stored as a deduplicated lowercase list.
export const splitEmails = (value: string) => [
  ...new Set(
    value
      .split(EMAIL_LIST_SEPARATOR)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  ),
];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

export const clientSchema = z.object({
  address: optionalText(CLIENT_ADDRESS_MAX_LENGTH),
  deciderEmail: z.string().trim().toLowerCase().pipe(z.email()),
  deciderName: z.string().trim().min(1).max(CLIENT_NAME_MAX_LENGTH),
  name: z.string().trim().min(1).max(CLIENT_NAME_MAX_LENGTH),
  notes: optionalText(CLIENT_NOTES_MAX_LENGTH),
  reviewerEmails: z
    .array(z.string().trim().toLowerCase().pipe(z.email()))
    .max(CLIENT_REVIEWERS_MAX)
    .transform((emails) => [...new Set(emails)]),
  // Null keeps the workspace default plan terms.
  revisionTerms: revisionTermsSchema.nullable(),
  siren: z
    .string()
    .transform(normalizeSiren)
    .refine((value) => value === "" || isSiren(value))
    .transform((value) => value || null),
});

export type ClientInput = z.input<typeof clientSchema>;

export const clientIdSchema = z.object({ id: z.string().min(1) });

export const clientUpdateSchema = clientSchema.extend(clientIdSchema.shape);
