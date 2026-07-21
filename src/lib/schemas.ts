import { z } from "zod";

export const actions = ["goto", "click", "fill", "press", "wait", "assert_text", "assert_url", "assert_visible", "assert_focused", "screenshot"] as const;
export const targetStrategies = ["role", "label", "placeholder", "text", "css"] as const;

export const elementTargetSchema = z.object({
  strategy: z.enum(targetStrategies),
  role: z.string().nullable(),
  name: z.string().nullable(),
  value: z.string().nullable(),
});

export const stepSchema = z.object({
  id: z.string().min(1),
  action: z.enum(actions),
  target: elementTargetSchema.nullable(),
  value: z.string().nullable(),
  description: z.string(),
  expectedResult: z.string().nullable(),
  critical: z.boolean(),
});

export const planSchema = z.object({
  claim: z.string(),
  interpretation: z.string(),
  assumptions: z.array(z.string()),
  successCriteria: z.array(z.string()),
  steps: z.array(stepSchema).min(1).max(14),
});

export const focusSchema = z.object({ tag: z.string(), role: z.string(), accessibleName: z.string(), label: z.string(), text: z.string(), visibleFocusIndicator: z.boolean() });
export const evidenceSchema = z.object({
  stepId: z.string(), status: z.enum(["passed", "failed", "skipped"]), description: z.string(), observedResult: z.string(), currentUrl: z.string(),
  screenshotPath: z.string().optional(), consoleErrors: z.array(z.string()), durationMs: z.number(), error: z.string().optional(), attemptedTarget: z.string().optional(), focus: focusSchema.optional(), critical: z.boolean().optional(),
});

export const verdictSchema = z.object({
  status: z.enum(["verified", "failed", "partial", "inconclusive"]), confidence: z.number().int().min(0).max(100), summary: z.string(), evidenceFor: z.array(z.string()), evidenceAgainst: z.array(z.string()), reproductionSteps: z.array(z.string()), likelyRootCause: z.string().nullable(), suggestedFix: z.string().nullable(),
});

export const requestSchema = z.object({
  url: z.string().url().refine((v) => ["http:", "https:"].includes(new URL(v).protocol), "Only HTTP(S) URLs are permitted"),
  claims: z.array(z.string().min(3).max(500)).min(1).max(3), instructions: z.string().max(1500).optional(), sample: z.boolean().optional(),
});

export type ElementTarget = z.infer<typeof elementTargetSchema>;
export type TestPlan = z.infer<typeof planSchema>;
export type StepEvidence = z.infer<typeof evidenceSchema>;
export type ClaimVerdict = z.infer<typeof verdictSchema>;
export function formatVerdict(s: ClaimVerdict["status"]) { return s === "partial" ? "Partial" : s[0].toUpperCase() + s.slice(1); }
