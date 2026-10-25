import type { Metadata, Viewport } from "next";

// Self-hosted fonts from npm (no Google Fonts request at build or run time).
// Barlow for body text, Barlow Condensed for big score numbers.
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GullyScore — live cricket scores",
    template: "%s · GullyScore",
  },
  description:
    "Live ball-by-ball scoring for local cricket. Follow the score and ask the AI agent anything about the match.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1210" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
