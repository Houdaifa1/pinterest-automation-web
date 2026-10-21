import { scheduleSchema } from "./schedule-plan";
import { z } from "zod";
export const configSchema = z.object({
  emailTo: z.email().or(z.literal("")).default(""),
  botEmail: z.email().or(z.literal("")).default(""),
  timeZone: z
    .string()
    .max(80)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    })
    .default("Africa/Casablanca"),
  reportHour: z.number().int().min(6).max(23).default(22),
  notifyEmail: z.boolean().default(true),
  notifyTelegram: z.boolean().default(false),
  emailEveryPin: z.boolean().default(false),
  lowQueue: z.number().int().min(0).max(100).default(10),
  google: z.string().max(80).default(""),
  gmail: z.string().max(80).default(""),
  telegram: z.string().max(80).default(""),
  accounts: z
    .array(
      z.object({
        id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
        name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 _-]{0,29}$/),
        username: z.string().regex(/^[A-Za-z0-9_]{1,30}$/),
        connection: z.string().max(80),
        niche: z.string().max(300),
        general: z.boolean().default(false),
        category: z.enum([
          "crochet",
          "food",
          "home",
          "printables",
          "diy",
          "other",
        ]),
        source: z.enum(["niche", "website"]),
        website: z.string().max(500).default(""),
        pinsPerProduct: z.number().int().min(3).max(15).default(6),
        pinsPerDay: z.number().int().min(1).max(1440),
        legacyDailyCap: z.number().int().min(1).max(1440).optional(),
        schedule: scheduleSchema.optional(),
        hours: z.array(z.number().int().min(6).max(23)).min(1).max(18),
        on: z.boolean().default(true),
      }),
    )
    .max(20)
    .default([]),
});
