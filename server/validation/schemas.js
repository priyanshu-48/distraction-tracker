import { z } from "zod";
import { normalizeDomain } from "../domain/sites.js";
import { isCalendarDate } from "../domain/dates.js";

const isoTime = z.iso.datetime({ offset: true });

export const registerSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(72), // bcrypt ignores bytes past 72
});

export const loginSchema = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(72),
});

const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;

const intervalSchema = z
  .object({
    clientEventId: z.uuid(),
    url: z.url({ protocol: /^https?$/ }).max(2048),
    // Lenient on purpose (a rejected batch is dropped by the extension), but always stored normalized.
    domain: z.string().min(1).max(253).transform(normalizeDomain),
    title: z.string().max(512).optional().default(""),
    startedAt: isoTime,
    endedAt: isoTime,
  })
  .refine(
    (i) => {
      const ms = Date.parse(i.endedAt) - Date.parse(i.startedAt);
      return ms >= 0 && ms <= MAX_INTERVAL_MS;
    },
    { message: "endedAt must be after startedAt, within 24h" }
  );

export const intervalsSchema = z.object({
  intervals: z.array(intervalSchema).min(1).max(50),
});

const LABEL = "[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?";
const HOSTNAME = new RegExp(`^${LABEL}(?:\\.${LABEL})*$`);

// A hostname typed by a user or taken from the URL path.
const siteDomain = z
  .string()
  .trim()
  .min(1)
  .max(253)
  // Dot-separated labels of 1-63 letters, digits or hyphens; a label cannot start or end with a hyphen.
  .regex(HOSTNAME, "must be a hostname such as youtube.com")
  .transform(normalizeDomain)
  .refine((d) => d.length > 0, "must be a hostname such as youtube.com");

export const siteParamsSchema = z.object({ domain: siteDomain });
export const markSiteSchema = z.object({ marked: z.boolean() });

export const listSitesQuerySchema = z.object({
  days: z.enum(["7", "30", "90"]).default("7").transform(Number),
  filter: z.enum(["all", "distractions", "unmarked"]).default("all"),
  q: z.string().trim().max(100).default(""),
  sort: z.enum(["time", "visits", "name"]).default("time"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const summaryQuerySchema = z.object({
  date: z.string().refine(isCalendarDate, "must be a date such as 2026-10-05"),
});

// What the account endpoints take: a format for the export, and the password that confirms a deletion.
export const exportQuerySchema = z.object({ format: z.enum(["json", "csv"]).default("json") });
export const confirmPasswordSchema = z.object({ password: z.string().min(1).max(72) });

export const rangeQuerySchema = z.object({
  view: z.enum(["week", "month"]),
  date: z.string().refine(isCalendarDate, "must be a date such as 2026-10-05"),
});

// 5 minutes to 24 hours, whole seconds (the database enforces the same range).
export const settingsSchema = z.object({
  dailyBudgetSeconds: z.number().int().min(300).max(86_400),
});
