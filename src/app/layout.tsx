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
import { NavProgress } from "@/components/ui/NavProgress";
import { ThemeScript } from "@/components/ui/ThemeProvider";

export const metadata: Metadata = {
  title: {
    default: "GullyScore — live cricket scores",
    template: "%s · GullyScore",
  },
  description:
    "Live ball-by-ball scoring for local cricket. Follow the score and ask the AI agent anything about the match.",
  applicationName: "GullyScore",
  // iPhone / iPad: open full screen when added to the home screen (manifest.ts does this elsewhere).
  appleWebApp: { capable: true, title: "GullyScore", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

// Installable app (PLT-06): register the service worker (public/sw.js) in production builds only,
// so `npm run dev` never serves stale cached pages while you're coding.
const REGISTER_SW =
  "if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}";

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
    // suppressHydrationWarning: ThemeScript may add "light" or "dark" to <html> before React loads.
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        {process.env.NODE_ENV === "production" && <script dangerouslySetInnerHTML={{ __html: REGISTER_SW }} />}
      </head>
      <body className="min-h-dvh">
        <NavProgress />
        {children}
      </body>
    </html>
  );
}
