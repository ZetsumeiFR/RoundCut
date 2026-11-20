import type { RevisionTerms } from "@roundcut/db/revision-terms";

// Plan templates offered to start a project (PRJ-07). "default" keeps the
// terms the project would inherit; the others prefill custom plan terms.
// Prices are in cents of the workspace currency, excluding VAT.
export const PRESET_PLAN_TEMPLATES = {
  brand: {
    extraRoundDelayDays: 3,
    extraRoundPriceCents: 30_000,
    includedRounds: 3,
    lightExtraRoundPriceCents: null,
    requirePayment: true,
    scope: "project",
  },
  corporate: {
    extraRoundDelayDays: 2,
    extraRoundPriceCents: 15_000,
    includedRounds: 2,
    lightExtraRoundPriceCents: null,
    requirePayment: true,
    scope: "deliverable",
  },
  social: {
    extraRoundDelayDays: 1,
    extraRoundPriceCents: 6000,
    includedRounds: 1,
    lightExtraRoundPriceCents: null,
    requirePayment: false,
    scope: "deliverable",
  },
} as const satisfies Record<string, RevisionTerms>;

export type PresetPlanTemplateId = keyof typeof PRESET_PLAN_TEMPLATES;
export type PlanTemplateId = "default" | PresetPlanTemplateId;

export const PLAN_TEMPLATE_IDS: readonly PlanTemplateId[] = [
  "default",
  "social",
  "corporate",
  "brand",
];

export const isPresetPlanTemplate = (
  id: PlanTemplateId
): id is PresetPlanTemplateId => id !== "default";

export const parsePlanTemplate = (value: unknown): PlanTemplateId | null =>
  PLAN_TEMPLATE_IDS.find((id) => id === value) ?? null;
