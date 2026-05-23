import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@news-aggregator/db";
import * as schema from "@news-aggregator/db/schema";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false
      }
    }
  },
  emailAndPassword: {
    enabled: true
  },
  trustedOrigins: [process.env.WEB_ORIGIN ?? "http://localhost:5173"]
});
