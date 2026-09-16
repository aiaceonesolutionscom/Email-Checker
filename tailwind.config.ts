import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        success: {
          DEFAULT: "#10b981",
          text: "#047857",
          subtle: "rgba(16,185,129,0.12)",
          border: "rgba(16,185,129,0.3)",
        },
        danger: {
          DEFAULT: "#f43f5e",
          text: "#be123c",
          subtle: "rgba(244,63,94,0.12)",
          border: "rgba(244,63,94,0.3)",
        },
        warning: {
          DEFAULT: "#f59e0b",
          text: "#b45309",
          subtle: "rgba(245,158,11,0.12)",
          border: "rgba(245,158,11,0.3)",
        },
        info: {
          DEFAULT: "#0ea5e9",
          text: "#0369a1",
          subtle: "rgba(14,165,233,0.12)",
          border: "rgba(14,165,233,0.3)",
        },
        neutral: {
          DEFAULT: "#64748b",
          text: "#475569",
          subtle: "rgba(100,116,139,0.12)",
          border: "rgba(100,116,139,0.3)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.06), 0 1px 1px rgba(15,23,42,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;