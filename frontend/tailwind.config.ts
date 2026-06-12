import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // TraceFlow dark palette.
        surface: {
          DEFAULT: "#0b0f1a",
          raised: "#121826",
          border: "#1f2937",
        },
        accent: {
          DEFAULT: "#6366f1",
          hover: "#818cf8",
          soft: "#312e81",
        },
        active: "#f59e0b",
        visited: "#10b981",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
