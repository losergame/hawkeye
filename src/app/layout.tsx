import type { Metadata } from "next";
import { Toaster } from "sonner";

import "@/app/globals.css";
import { ThemeProvider }      from "@/components/shared/theme-provider";
import { AuthSessionProvider } from "@/components/shared/session-provider";

export const metadata: Metadata = {
  title: "Hawkeye | Stock Analysis Dashboard",
  description: "AI-powered stock analysis, recommendations, watchlists, portfolio tracking, and market insights.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthSessionProvider>
        <ThemeProvider>
          <a href="#main-content" className="skip-link">Skip to main content</a>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                borderRadius: "var(--radius-md)",
                fontFamily: "var(--font-sans)",
                fontSize: "0.875rem",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
              },
              className: "hawkeye-toast"
            }}
          />
        </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
