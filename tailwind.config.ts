import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#F97316",
          hover: "#EA6A0C",
          soft: "#FFEDD5",
        },
      },
      fontFamily: {
        // DM Sans (self-hosted via next/font, lihat app/layout.tsx) — dipakai untuk
        // seluruh UI copy (heading "Mau mulai dari mana hari ini?", nav, body text, dst).
        sans: ["var(--font-dm-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // SF Pro tidak dilisensikan untuk di-self-host di luar platform Apple, jadi ini
        // pakai system-font stack yang resolve ke SF Pro asli di macOS/iOS (fallback ke
        // system-ui di platform lain). Dipakai HANYA untuk wordmark "FreeTokenAI".
        sf: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"SF Pro Text"',
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
