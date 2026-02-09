/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            /* ── Rui Huang Typography ──────────────────────── */
            fontFamily: {
                sans: ["'Inter'", "system-ui", "-apple-system", "sans-serif"],
                mono: ["'Space Mono'", "'JetBrains Mono'", "ui-monospace", "monospace"],
            },

            /* ── Color Tokens ──────────────────────────────── */
            colors: {
                /* shadcn/ui backward-compat (HSL) */
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                highlight: {
                    DEFAULT: "hsl(var(--highlight))",
                    foreground: "hsl(var(--highlight-foreground))",
                },

                /* Rui Huang first-class tokens */
                "deep": "#0F1215",
                "glass": "rgba(22, 27, 34, 0.60)",
                "subtle": "rgba(255, 255, 255, 0.08)",
                "focus": "#F59E0B",
                "safe": "#2D6A78",
                "slate-soft": "#E2E8F0",
                "slate-muted": "#64748B",
            },

            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },

            backdropBlur: {
                glass: "16px",
            },

            boxShadow: {
                "glass": "0 8px 32px 0 rgba(0, 0, 0, 0.4)",
                "glass-hover": "0 12px 40px 0 rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(245, 158, 11, 0.15)",
                "ambient": "0 0 24px rgba(245, 158, 11, 0.3)",
            },

            keyframes: {
                "accordion-down": {
                    from: { height: 0 },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: 0 },
                },
                "ambient-glow": {
                    "0%, 100%": { boxShadow: "0 0 6px rgba(245, 158, 11, 0.15)" },
                    "50%": { boxShadow: "0 0 24px rgba(245, 158, 11, 0.3)" },
                },
                "pulse-glow": {
                    "0%, 100%": { boxShadow: "0 0 5px hsl(var(--primary))" },
                    "50%": { boxShadow: "0 0 20px hsl(var(--primary))" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
                "ambient-glow": "ambient-glow 3s ease-in-out infinite",
                "pulse-glow": "pulse-glow 2s ease-in-out infinite",
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
}
