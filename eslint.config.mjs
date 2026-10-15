import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The public showcase uses Vite and prepared static image variants.
    files: ["apps/showcase/**/*.{ts,tsx}"],
    rules: { "@next/next/no-img-element": "off" },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    ".tools/**",
    ".cache/**",
    "apps/showcase/dist/**",
    "next-env.d.ts",
    "drizzle/**",
    "playwright-report/**",
    "test-results/**",
    "artifacts/**",
    "private-materials/**",
  ]),
]);
