import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "SignalForge AI | Stock Analysis Dashboard",
  description: "AI-powered stock analysis, recommendations, watchlists, portfolio tracking, and market insights.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
