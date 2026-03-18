/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        headline: ['Work Sans', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        brand: {
          100: '#FDF6D3',
          200: '#FAE96F',
          300: '#EBBB40',
          400: '#D4A85C',
          500: '#B8944E',
          600: '#8C7039',
          700: '#5C4A26',
        },
        amber: '#DF8D03',
        hop: '#649c67',
        forest: '#365241',
        dark: '#141414',
        malt: '#1C1A14',
        surface: '#272318',
      },
    },
  },
  plugins: [
    require('daisyui'),
    require('@tailwindcss/typography'),
  ],
  daisyui: {
    themes: [
      {
        brewcode: {
          "primary":          "#EBBB40",
          "primary-content":  "#141414",
          "secondary":        "#649c67",
          "secondary-content":"#E7E5E4",
          "accent":           "#DF8D03",
          "accent-content":   "#141414",
          "neutral":          "#1C1A14",
          "neutral-content":  "#E7E5E4",
          "base-100":         "#141414",
          "base-200":         "#1C1A14",
          "base-300":         "#272318",
          "base-content":     "#E7E5E4",
          "info":             "#EBBB40",
          "success":          "#649c67",
          "warning":          "#DF8D03",
          "error":            "#cf6679",
          "--rounded-box":      "0.5rem",
          "--rounded-btn":      "0.375rem",
          "--rounded-badge":    "0.25rem",
          "--btn-focus-scale":  "0.97",
          "--border-btn":       "1px",
          "--tab-border":       "2px",
          "--tab-radius":       "0.25rem",
        },
      },
    ],
  },
};
