import { defineConfig } from "drizzle-kit";

const isPostgres = !!process.env.DATABASE_URL;

export default defineConfig(
  isPostgres
    ? {
        out: "./migrations",
        schema: "./shared/schema.ts",
        dialect: "postgresql",
        dbCredentials: {
          url: process.env.DATABASE_URL!,
        },
      }
    : {
        out: "./migrations",
        schema: "./shared/schema.ts",
        dialect: "sqlite",
        dbCredentials: {
          url: "./data.db",
        },
      }
);
