import type { CapacitorConfig } from "@capacitor/cli";

const productionWebUrl =
  process.env.CAPACITOR_REMOTE_URL?.trim() || "https://vauto-chi.vercel.app";

/** APK release builds load the live site so users get updates without reinstalling. */
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
  server: useRemoteShell
    ? {
        url: productionWebUrl,
        androidScheme: "https",
      }
    : {
        androidScheme: "https",
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
