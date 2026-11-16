import { PROJECT_STATUSES } from "@roundcut/db/project-status";
import z from "zod";

import { deliverableSchema, PROJECT_MAX_DELIVERABLES } from "./deliverable";
import { revisionTermsSchema } from "./workspace";

export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_FLAT_FEE_MAX_CENTS = 100_000_000;

export const projectSchema = z.object({
  clientId: z.string().min(1),
  // Deliverables added from the creation sheet, kept in this order.
  deliverables: z
    .array(deliverableSchema)
    .max(PROJECT_MAX_DELIVERABLES)
    .default([]),
  // Optional, only used by the billing export.
  flatFeeCents: z.int().min(0).max(PROJECT_FLAT_FEE_MAX_CENTS).nullable(),
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH),
  // Null takes the terms the client follows (its own, or the workspace
  // defaults) at creation time.
  revisionTerms: revisionTermsSchema.nullable(),
  targetDate: z.iso.date().nullable(),
});

export type ProjectInput = z.input<typeof projectSchema>;

// A copy keeps the client, plan terms and flat fee of its source (PRJ-06);
// its deliverables are new drafts, recreated from the source's list on demand.
export const projectDuplicateSchema = z.object({
  copyDeliverables: z.boolean().default(false),
  id: z.string().min(1),
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH),
});

export const projectStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(PROJECT_STATUSES),
});
