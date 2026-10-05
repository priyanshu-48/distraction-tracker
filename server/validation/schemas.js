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

export const startTabSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2048),
  domain: z.string().min(1).max(253),
  title: z.string().max(512).optional().default(""),
  startTime: isoTime,
});

export const endTabSchema = z.object({
  endedAt: isoTime,
});
