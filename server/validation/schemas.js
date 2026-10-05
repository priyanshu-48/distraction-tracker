import { z } from "zod";

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
    domain: z.string().min(1).max(253),
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
