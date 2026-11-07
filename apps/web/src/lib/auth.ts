import "server-only";
import { betterAuth } from "better-auth";
import { loadEnv } from "@ff/config";
import { brand } from "@ff/config/brand";
import { createEmailTransport } from "@ff/providers/email";
import { db } from "./server";

const env = loadEnv();

/**
 * Better Auth: email + password with verified email, secure httpOnly session cookies.
 * Verification emails go through the same transport guard (outbox/Mailpit outside production).
 */
export const auth = betterAuth({
  appName: brand.name,
  baseURL: env.APP_BASE_URL,
  secret: env.AUTH_SECRET ?? "dev-only-insecure-secret-change-me-0123456789",
  database: db(),
  emailAndPassword: { enabled: true, requireEmailVerification: env.appEnv === "production", minPasswordLength: 10 },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await createEmailTransport(env, db()).send({ to: user.email, subject: `Verify your ${brand.name} account`, text: `Confirm your email to save events and get alerts:\n\n${url}\n\nIf you didn't sign up, ignore this email.` });
    },
  },
  user: { additionalFields: { role: { type: "string", input: false, defaultValue: "user" } } },
  advanced: { useSecureCookies: env.appEnv === "production" },
  rateLimit: { enabled: true, window: 60, max: 30 },
});
