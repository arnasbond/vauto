import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.vauto.app",
  appName: "Vauto",
  webDir: "out",
  android: {
    allowMixedContent: true,
  },
  server: {
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
  },
};

export default config;
