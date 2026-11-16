import z from "zod";

import { revisionTermsSchema } from "./workspace";

export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_FLAT_FEE_MAX_CENTS = 100_000_000;

export const projectSchema = z.object({
  clientId: z.string().min(1),
  // Optional, only used by the billing export.
  flatFeeCents: z.int().min(0).max(PROJECT_FLAT_FEE_MAX_CENTS).nullable(),
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH),
  // Null takes the terms the client follows (its own, or the workspace
  // defaults) at creation time.
  revisionTerms: revisionTermsSchema.nullable(),
  targetDate: z.iso.date().nullable(),
});

export type ProjectInput = z.input<typeof projectSchema>;
