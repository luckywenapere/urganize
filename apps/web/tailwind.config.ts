import type { Config } from "tailwindcss";

const withOpacity = (cssVarName: string) => `rgb(var(${cssVarName}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Background hierarchy
        bg: {
          base: withOpacity('--color-bg-base'),
          surface: withOpacity('--color-bg-surface'),
          elevated: withOpacity('--color-bg-elevated'),
          overlay: withOpacity('--color-bg-overlay'),
          hover: withOpacity('--color-bg-hover'),
          active: withOpacity('--color-bg-active'),
        },
        // Brand
        brand: {
          DEFAULT: withOpacity('--color-brand'),
          hover: withOpacity('--color-brand-hover'),
          muted: 'rgb(var(--color-brand) / 0.16)',
          subtle: 'rgb(var(--color-brand) / 0.09)',
        },
        // Text
        content: {
          primary: withOpacity('--color-text-primary'),
          secondary: withOpacity('--color-text-secondary'),
          tertiary: withOpacity('--color-text-tertiary'),
          quaternary: withOpacity('--color-text-quaternary'),
          inverse: withOpacity('--color-text-inverse'),
        },
        // Borders
        stroke: {
          subtle: 'rgb(var(--color-stroke) / 0.08)',
          default: 'rgb(var(--color-stroke) / 0.14)',
          strong: 'rgb(var(--color-stroke) / 0.22)',
        },
        // Status
        status: {
          success: withOpacity('--color-status-success'),
          warning: withOpacity('--color-status-warning'),
          error: withOpacity('--color-status-error'),
          info: withOpacity('--color-status-info'),
        },
        // Phases
        phase: {
          preproduction: withOpacity('--color-phase-preproduction'),
          production: withOpacity('--color-phase-production'),
          promotion: withOpacity('--color-phase-promotion'),
          distribution: withOpacity('--color-phase-distribution'),
        },
      },
      fontFamily: {
        sans: ['Space Grotesk', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['Syne', 'Space Grotesk', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'xs': ['11px', { lineHeight: '16px' }],
        'sm': ['13px', { lineHeight: '20px' }],
        'base': ['14px', { lineHeight: '22px' }],
        'lg': ['16px', { lineHeight: '24px' }],
        'xl': ['18px', { lineHeight: '26px' }],
        '2xl': ['22px', { lineHeight: '28px', letterSpacing: '-0.02em' }],
        '3xl': ['28px', { lineHeight: '34px', letterSpacing: '-0.02em' }],
        '4xl': ['36px', { lineHeight: '42px', letterSpacing: '-0.02em' }],
      },
      spacing: {
        '18': '72px',
        '88': '352px',
      },
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
        '2xl': '16px',
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0, 0, 0, 0.4)',
        'md': '0 4px 12px rgba(0, 0, 0, 0.5)',
        'lg': '0 12px 40px rgba(0, 0, 0, 0.6)',
        'glow': '0 0 30px rgba(16, 185, 129, 0.4)',
        'glow-sm': '0 0 15px rgba(16, 185, 129, 0.2)',
      },
      animation: {
        'fade-in': 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in': 'slideInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.65, 0, 0.35, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'spin': 'spin 1s linear infinite',
        'bounce-in': 'bounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.4)' },
          '50%': { boxShadow: '0 0 0 8px transparent' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        bounceIn: {
          '0%': { opacity: '0', transform: 'translateY(-10px) scale(0.95)' },
          '50%': { transform: 'translateY(2px) scale(1.02)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      transitionTimingFunction: {
        'out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        'instant': '50ms',
        'fast': '100ms',
        'normal': '200ms',
        'slow': '300ms',
        'slower': '500ms',
      },
    },
  },
  plugins: [],
};

export default config;
