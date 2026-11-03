import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import sharedPreset from "@urganize/config/tailwind";

const config: Config = {
  presets: [sharedPreset],
  plugins: [
    // `touch:` is a screen with no hover (phones, tablets), where a control
    // that only shows on hover has to be drawn some other way.
    plugin(({ addVariant }) => addVariant("touch", "@media (hover: none)")),
  ],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./types/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}"
  ]
};

export default config;
