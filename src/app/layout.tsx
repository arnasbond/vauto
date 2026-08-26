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
    title: "VAUTO — AI skelbimai: NT, transportas, darbas ir paslaugos",
    description:
      "Parduokite ir raskite NT, techniką, paslaugas, darbą ir transportą visoje Lietuvoje. AI paruošia juodraštį ir atrenka rezultatus — jūs patvirtinate. Kainos rėžis yra rekomendacija.",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "VAUTO",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VAUTO — AI skelbimai: NT, transportas, darbas ir paslaugos",
    description:
      "Parduokite ir raskite NT, techniką, paslaugas, darbą ir transportą visoje Lietuvoje. AI paruošia juodraštį ir atrenka rezultatus — jūs patvirtinate. Kainos rėžis yra rekomendacija.",
    images: ["/icon-512.png"],
  },
  other: {
    google: "notranslate",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192" }],
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
  themeColor: "#F4F7FC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lt" translate="no" suppressHydrationWarning data-app-theme="light">
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
