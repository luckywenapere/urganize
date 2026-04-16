import { FlatCompat } from "@eslint/eslintrc";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: resolve(__dirname, "../../..") });

const config = [
  ...compat.extends("next/core-web-vitals")
];

export default config;
