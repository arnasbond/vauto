import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Vauto — Paprastiausi skelbimai",
  description:
    "Revoliucinis skelbimų portalas: nulis formų pardavėjams, semantinė paieška pirkėjams.",
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
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lt">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
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
