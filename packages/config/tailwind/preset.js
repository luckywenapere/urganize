const withOpacity = (cssVarName) => `rgb(var(${cssVarName}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
const preset = {
  theme: {
    extend: {
      colors: {
        bg: {
          base: withOpacity("--color-bg-base"),
          sidebar: withOpacity("--color-bg-sidebar"),
          "sidebar-active": withOpacity("--color-bg-sidebar-active"),
          surface: withOpacity("--color-bg-surface"),
          elevated: withOpacity("--color-bg-elevated"),
          overlay: withOpacity("--color-bg-overlay"),
          hover: withOpacity("--color-bg-hover"),
          active: withOpacity("--color-bg-active")
        },
        brand: {
          DEFAULT: withOpacity("--color-brand"),
          hover: withOpacity("--color-brand-hover"),
          muted: "rgb(var(--color-brand) / 0.16)",
          subtle: "rgb(var(--color-brand) / 0.08)"
        },
        content: {
          primary: withOpacity("--color-text-primary"),
          secondary: withOpacity("--color-text-secondary"),
          tertiary: withOpacity("--color-text-tertiary"),
          quaternary: withOpacity("--color-text-quaternary"),
          inverse: withOpacity("--color-text-inverse")
        },
        stroke: {
          subtle: "rgb(var(--color-stroke) / 0.04)",
          default: "rgb(var(--color-stroke) / 0.06)",
          strong: "rgb(var(--color-stroke) / 0.1)"
        },
        status: {
          success: withOpacity("--color-status-success"),
          warning: withOpacity("--color-status-warning"),
          error: withOpacity("--color-status-error"),
          info: withOpacity("--color-status-info")
        }
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["Space Grotesk", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"]
      },
      fontSize: {
        xs: ["11px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "20px" }],
        base: ["14px", { lineHeight: "22px" }],
        lg: ["16px", { lineHeight: "24px" }],
        xl: ["18px", { lineHeight: "26px" }],
        "2xl": ["22px", { lineHeight: "28px", letterSpacing: "-0.02em" }],
        "3xl": ["28px", { lineHeight: "34px", letterSpacing: "-0.02em" }],
        "4xl": ["36px", { lineHeight: "42px", letterSpacing: "-0.02em" }]
      },
      spacing: {
        18: "72px",
        88: "352px"
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px"
      },
      boxShadow: {
        sm: "0 8px 18px rgba(0, 0, 0, 0.24)",
        md: "0 18px 42px rgba(0, 0, 0, 0.34)",
        lg: "0 28px 72px rgba(0, 0, 0, 0.46)",
        glow: "0 0 30px rgba(62, 207, 142, 0.22)",
        "glow-sm": "0 0 15px rgba(62, 207, 142, 0.14)"
      },
      animation: {
        "fade-in": "fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-in": "scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "slide-in": "slideInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "pulse-glow": "pulseGlow 2s cubic-bezier(0.65, 0, 0.35, 1) infinite",
        shimmer: "shimmer 1.4s ease-in-out infinite",
        spin: "spin 1s linear infinite",
        "bounce-in": "bounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards"
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-10px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(62, 207, 142, 0.28)" },
          "50%": { boxShadow: "0 0 0 8px transparent" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        },
        bounceIn: {
          "0%": { opacity: "0", transform: "translateY(-10px) scale(0.95)" },
          "50%": { transform: "translateY(2px) scale(1.02)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" }
        }
      },
      // Motion tokens — single source of truth. The CSS variables themselves
      // live in apps/web/app/globals.css; the Tailwind preset references
      // them via `var(--motion-*)` so a class like `duration-fast` and a
      // CSS rule like `transition: ... var(--motion-fast)` always resolve
      // to the same physical value. Adding or changing a duration here
      // requires updating the CSS var (and vice versa) — but no name can
      // resolve to two different values.
      //
      // Three durations only: fast / base / slow. Two easings only: out /
      // standard. `spring` is retained for celebratory carve-outs (no
      // hover/press/menu/routine use); `instant`, `normal`, `slower`, and
      // the old `in-out` are dropped — see audit recon for the drift each
      // one caused.
      transitionTimingFunction: {
        out: "var(--motion-out)",
        standard: "var(--motion-standard)",
        spring: "var(--ease-spring)"
      },
      transitionDuration: {
        fast: "var(--motion-fast)",
        base: "var(--motion-base)",
        slow: "var(--motion-slow)"
      }
    }
  },
  plugins: []
};

export default preset;
