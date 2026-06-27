import type { CapacitorConfig } from "@capacitor/cli";

const productionWebUrl =
  process.env.CAPACITOR_REMOTE_URL?.trim() || "https://vauto-chi.vercel.app";

/**
 * Remote shell (CAPACITOR_USE_REMOTE=1) loads the live site — fragile on poor networks.
 * Production APK builds use bundled `out/` assets for stable offline launch.
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
