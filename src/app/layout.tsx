import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { AppProviders } from "@/context/AppProviders";
import { NativeShell } from "@/components/NativeShell";
import { BackButtonHandler } from "@/components/BackButtonHandler";
import { ToastHost } from "@/components/ui/ToastHost";
import { SITE_URL } from "@/lib/site-url";
import { silenceProductionConsole } from "@/lib/dev-log";
import "./globals.css";

silenceProductionConsole();

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "VAUTO — AI skelbimai: NT, transportas, darbas ir paslaugos",
  description:
    "Parduokite ir raskite NT, techniką, paslaugas, darbą ir transportą visoje Lietuvoje. AI paruošia juodraštį ir atrenka rezultatus — jūs patvirtinate. Kainos rėžis yra rekomendacija.",
  manifest: "/manifest.json",
  alternates: {
    canonical: "/",
  },
openGraph: {
type: "website",
locale: "lt_LT",
url: "/",
siteName: "VAUTO",
title: "VAUTO - AI skelbimai: NT, transportas, darbas ir paslaugos",
description:
"Parduokite ir raskite NT, technik�, paslaugas, darb� ir transport� visoje Lietuvoje. AI paruo�ia juodra�t� ir atrenka rezultatus - j�s patvirtinate. Kainos r��is yra rekomendacija.",
images: [
{
url: "/og-1200x630.png",
width: 1200,
height: 630,
alt: "VAUTO",
},
],
},
twitter: {
card: "summary_large_image",
title: "VAUTO - AI skelbimai: NT, transportas, darbas ir paslaugos",
description:
"Parduokite ir raskite NT, technik�, paslaugas, darb� ir transport� visoje Lietuvoje. AI paruo�ia juodra�t� ir atrenka rezultatus - j�s patvirtinate. Kainos r��is yra rekomendacija.",
images: ["/og-1200x630.png"],
},
other: {
google: "notranslate",
},
icons: {
icon: [
{ url: "/favicon.ico" },
{ url: "/icon-192.png", sizes: "192x192", type: "image/png" },
{ url: "/icon-512.png", sizes: "512x512", type: "image/png" },
],
apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
},
appleWebApp: {
capable: true,
statusBarStyle: "black-translucent",
title: "VAUTO",
},
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0B1220",
};

/**
 * MASTER Wave 1 — zero-FOUC theme bootstrap.
 *
 * Runs synchronously in <head>, before the browser paints <body> and before
 * React hydrates, so the correct theme is applied on the very first frame —
 * for a returning DARK user, a first-time visitor with OS dark mode, and
 * every route (this is a route-agnostic <html> attribute, not page state).
 *
 * This mirrors the resolution rules in `src/lib/app-theme.ts`
 * (`normalizeAppThemePreference` + `resolveActiveTheme`) but is intentionally
 * duplicated as plain JS: it must execute standalone, before any bundled
 * module loads. Keep both in sync if the theme contract changes.
 *
 * Wrapped in try/catch: if localStorage or matchMedia are unavailable
 * (privacy mode, very old browser, JS partially blocked), it silently no-ops
 * and the static `data-app-theme="light"` fallback already on <html> below
 * is used instead — a safe, deterministic default.
 */
const THEME_INIT_SCRIPT = `(function(){try{var k="vauto_app_theme_v1";var s=window.localStorage.getItem(k);var pref=(s==="light"||s==="dark")?s:"system";var active;if(pref==="light"||pref==="dark"){active=pref;}else{var mql=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)");active=(mql&&mql.matches)?"dark":"light";}document.documentElement.setAttribute("data-app-theme",active);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lt" translate="no" suppressHydrationWarning data-app-theme="light">
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} antialiased`}
      >
        <AppProviders>
          <NativeShell>
            <BackButtonHandler />
            <ToastHost />
            {children}
          </NativeShell>
        </AppProviders>
      </body>
    </html>
  );
}
