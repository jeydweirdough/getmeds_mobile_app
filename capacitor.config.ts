import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Same id as the Getmeds app already on the stores, so this build can replace it.
  // Uploading an update needs the Play Console account and its app signing key.
  appId: 'com.getmeds.ph',
  appName: 'Getmeds',
  webDir: 'dist',
  server: {
    // The app's pages are served from inside the APK under https://app.getmeds.ph. Nothing is
    // fetched from that address; it only names the app's origin to the services it calls:
    //   - Sanity CORS settings must list https://app.getmeds.ph
    //   - the Cloudflare Turnstile widget must list app.getmeds.ph as a hostname
    // The backend and WordPress already accept it.
    androidScheme: 'https',
    hostname: 'app.getmeds.ph',
  },
  android: {
    backgroundColor: '#ffffff',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    StatusBar: {
      backgroundColor: '#1D9FDA',
      style: 'DARK',
      overlaysWebView: false,
    },
  },
};

export default config;
