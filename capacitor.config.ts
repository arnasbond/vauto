import type { CapacitorConfig } from "@capacitor/cli";

const productionWebUrl =
  process.env.CAPACITOR_REMOTE_URL?.trim() || "https://vauto-chi.vercel.app";

/**
 * Production APK = remote shell → always loads live web (vauto-chi.vercel.app).
 * Same fixes as browser; only the thin native wrapper is baked into the APK.
 * Set CAPACITOR_USE_REMOTE=0 for offline bundled dev builds.
 */
const useRemoteShell =
  process.env.CAPACITOR_USE_REMOTE === "1" ||
  process.env.CAPACITOR_USE_REMOTE === "true";

const config: CapacitorConfig = {
  appId: "com.vauto.app",
  appName: "Vauto",
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
          "vauto-chi.vercel.app",
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
