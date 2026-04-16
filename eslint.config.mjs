import sharedConfig from "@urganize/config/eslint/next";

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
