import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Honor the leading-underscore convention for intentionally unused
      // variables, parameters, caught errors, and array destructure slots.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],

      // Downgraded to warn during the React 19 migration. The rule flags
      // legitimate "fetch on mount" and "derive with cleanup" patterns whose
      // safe replacements (lazy useState, useSyncExternalStore, deferred
      // state) require per-component design decisions. Keep findings visible
      // so they get picked off when components are touched; don't block CI
      // on a stylistic-shape sweep across working code.
      "react-hooks/set-state-in-effect": "warn",

      // React Compiler advisory, not a bug — fires when an existing useMemo
      // / useCallback can't be auto-preserved by the compiler. Keep visible
      // as a warning for the eventual compiler-clean pass.
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
];

export default config;
