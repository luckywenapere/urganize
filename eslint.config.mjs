import sharedConfig from "./packages/config/eslint/next.mjs";

export default [
  ...sharedConfig,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "apps/web/.next/**",
      "out/**",
      "build/**",
      ".turbo/**"
    ]
  }
];
