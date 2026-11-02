import { z } from "zod";
import { isValidDateStr } from "./dates.js";
import { UNIT_LIST } from "./units.js";

// Shared building blocks for request validation.

export const trimmed = (max: number, label: string) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));

export const dateStr = (label: string) =>
  z.string({ error: `${label} is required` }).refine(isValidDateStr, `${label} must be a valid date (YYYY-MM-DD)`);

export const optionalDate = (label: string) =>
  z
    .union([z.literal(""), z.null(), dateStr(label)])
    .optional()
    .transform((v) => (v ? v : null));

export const quantity = (label = "Quantity") =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .finite(`${label} must be a number`)
    .positive(`${label} must be greater than 0`)
    .max(1_000_000, `${label} is too large`)
    .refine((v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6, `${label} can have at most 3 decimal places`);

export const nonNegative = (label: string) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .finite()
    .min(0, `${label} cannot be negative`)
    .max(1_000_000, `${label} is too large`);

export const money = (label = "Cost") =>
  z
    .union([z.literal(""), z.null(), z.coerce.number().finite().min(0, `${label} cannot be negative`).max(100_000_000)])
    .optional()
    .transform((v) => (v === "" || v == null ? null : Math.round(Number(v) * 100) / 100));

export const unit = z.enum(UNIT_LIST as [string, ...string[]], { error: "Choose a valid unit" });

export const id = (label: string) => z.string({ error: `${label} is required` }).uuid(`${label} is invalid`);
