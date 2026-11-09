import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 中传深蓝 —— 纸面排版用的墨蓝体系
        cuc: {
          50: "#eef1f5",
          100: "#dde4ec",
          200: "#c3cedb",
          300: "#9fb0c4",
          400: "#6f89a6",
          500: "#3f6285",
          600: "#1d4265",
          700: "#16344f",
          800: "#11283d",
          900: "#0d1f2e",
        },
        // 纸面与墨线
        paper: "#f6f4ee",
        ink: "#16202b",
        line: "#e2ddd2",
        // 状态色（低饱和，贴合纸面）
        state: {
          ok: "#2f6b52",
          okBg: "#eaf3ee",
          okBorder: "#bfd9cb",
          warn: "#8a5a12",
          warnBg: "#f8f0e0",
          warnBorder: "#e2c99c",
          stop: "#8f2f2f",
          stopBg: "#f6e9e7",
          stopBorder: "#e4c0bb",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "sans-serif",
        ],
        display: [
          "Songti SC",
          "Noto Serif SC",
          "Source Han Serif SC",
          "SimSun",
          "Georgia",
          "serif",
        ],
      },
      boxShadow: {
        card: "none",
        lift: "none",
      },
    },
  },
  plugins: [],
};

export default config;
