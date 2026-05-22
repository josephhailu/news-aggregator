import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172026",
        paper: "#f7f4ef",
        citrus: "#d7ec63",
        coral: "#ff7f6e",
        river: "#277da1"
      },
      boxShadow: {
        soft: "0 18px 45px rgba(23, 32, 38, 0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;
