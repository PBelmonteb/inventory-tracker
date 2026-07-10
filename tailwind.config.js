/** @type {import('tailwindcss').Config} */
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`;

module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Tokens semánticos (cambian con la clase .dark vía variables CSS)
        canvas: withAlpha("--canvas"),
        surface: {
          DEFAULT: withAlpha("--surface"),
          2: withAlpha("--surface-2"),
        },
        line: withAlpha("--line"),
        fg: withAlpha("--fg"),
        muted: withAlpha("--muted"),
        faint: withAlpha("--faint"),
        accent: {
          DEFAULT: withAlpha("--accent"),
          fg: withAlpha("--accent-fg"),
        },
        sidebar: {
          DEFAULT: withAlpha("--sidebar"),
          surface: withAlpha("--sidebar-surface"),
          fg: withAlpha("--sidebar-fg"),
          muted: withAlpha("--sidebar-muted"),
          line: withAlpha("--sidebar-line"),
        },
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04)",
        soft: "0 4px 16px -4px rgb(0 0 0 / 0.10)",
      },
    },
  },
  plugins: [],
};
