import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/**
 * Next 16 removed `next lint` — lint through the ESLint CLI instead (`bun run lint`).
 * See node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md
 */
export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,

  globalIgnores([
    // Defaults of eslint-config-next, which are replaced rather than extended
    // once we declare our own.
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  {
    rules: {
      // The domain is Swedish and the API's own field names are kept verbatim
      // (see src/lib/skolregister/types.ts). Unused *args* are common in the
      // declarative column `cell(value, muted)` signatures, so allow them when
      // prefixed with _ rather than reshaping working component APIs.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);
