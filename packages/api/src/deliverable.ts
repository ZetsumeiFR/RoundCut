import { DELIVERABLE_ASPECTS } from "@roundcut/db/deliverable";
import z from "zod";

export const DELIVERABLE_TITLE_MAX_LENGTH = 120;
export const DELIVERABLE_MAX_DURATION_SECONDS = 4 * 60 * 60;
export const PROJECT_MAX_DELIVERABLES = 50;

export const deliverableSchema = z.object({
  aspect: z.enum(DELIVERABLE_ASPECTS),
  targetDurationSeconds: z
    .int()
    .min(1)
    .max(DELIVERABLE_MAX_DURATION_SECONDS)
    .nullable(),
  title: z.string().trim().min(1).max(DELIVERABLE_TITLE_MAX_LENGTH),
});

export type DeliverableInput = z.input<typeof deliverableSchema>;
