import type { Config } from "tailwindcss";

// 语义色板 —— 值在 globals.css 的 CSS 变量里 (存 "R G B" 三元组)。
// <alpha-value> 让 border-line/50 / bg-primary/10 这类修饰符照常工作。
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        card: token("card"),
        ink: token("ink"),
        muted: token("muted"),
        line: token("line"),
        surface: token("surface"),
        primary: token("primary"),
        brand: {
          green: token("green"),
          red: token("red"),
          blue: token("blue"),
          orange: token("orange"),
        },
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "1.05rem",
        "2xl": "1.35rem",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
