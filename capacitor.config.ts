import type { CapacitorConfig } from "@capacitor/cli";

const productionWebUrl =
  process.env.CAPACITOR_REMOTE_URL?.trim() || "https://www.vauto.lt";

/**
 * Production APK = bundled `out/` assets (stable login, works offline at launch).
 * Set CAPACITOR_USE_REMOTE=1 only for dev parity testing against live Vercel.
 */
const useRemoteShell =
  process.env.CAPACITOR_USE_REMOTE === "1" ||
  process.env.CAPACITOR_USE_REMOTE === "true";

const config: CapacitorConfig = {
  appId: "com.vauto.app",
  appName: "VAUTO",
  webDir: "out",
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: "automatic",
  },
  server: useRemoteShell
    ? {
        url: productionWebUrl,
        androidScheme: "https",
        iosScheme: "capacitor",
        cleartext: false,
        allowNavigation: [
          "www.vauto.lt",
          "vauto.lt",
          "vauto-api.onrender.com",
          "checkout.stripe.com",
          "billing.stripe.com",
          "accounts.google.com",
        ],
      }
    : {
        androidScheme: "https",
        iosScheme: "capacitor",
        hostname: "localhost",
        cleartext: false,
      },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#00BFA5",
      androidSplashResourceName: "splash_screen",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#00BFA5",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Share: {},
  },
};

export default config;
