import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { VautoProvider } from "@/context/VautoContext";
import { NativeShell } from "@/components/NativeShell";
import { BackButtonHandler } from "@/components/BackButtonHandler";
import { ToastHost } from "@/components/ui/ToastHost";
import { SellerFlowProvider } from "@/components/SellerFlowProvider";
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
  title: "Vauto — Skelbimai ir paslaugos Panevėžyje",
  description:
    "Parduok ir rask prekes bei paslaugas Panevėžyje per sekundes. AI skelbimai, skambink tiesiai pardavėjui — VAUTO.",
  manifest: "/manifest.json",
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
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b0f17",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lt">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} antialiased`}
      >
        <VautoProvider>
          <NativeShell>
            <BackButtonHandler />
            <ToastHost />
            <SellerFlowProvider>{children}</SellerFlowProvider>
          </NativeShell>
        </VautoProvider>
      </body>
    </html>
  );
}
