import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { AppProviders } from "@/context/AppProviders";
import { NativeShell } from "@/components/NativeShell";
import { BackButtonHandler } from "@/components/BackButtonHandler";
import { ToastHost } from "@/components/ui/ToastHost";
import "./globals.css";

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
  title: "Vauto — AI skelbimai ir paslaugos visoje Lietuvoje",
  description:
    "Parduok ir rask prekes bei paslaugas visoje Lietuvoje per sekundes. AI foto paieška, rinkos kainų patarimai ir skambutis tiesiai pardavėjui — VAUTO.",
  manifest: "/manifest.json",
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
    title: "Vauto",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0b0f17",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lt" translate="no" suppressHydrationWarning>
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
