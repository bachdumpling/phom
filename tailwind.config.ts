import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        muted: "var(--muted)",
        surface: "var(--surface)",
        accent: "var(--accent)",
        accentSoft: "var(--accent-soft)",
        stroke: "var(--stroke)"
      },
      boxShadow: {
        card: "0 1px 0 rgba(0,0,0,0.12)",
        glow: "0 0 0 1px rgba(0,0,0,0.08)"
      }
    }
  },
  plugins: []
};

export default config;
