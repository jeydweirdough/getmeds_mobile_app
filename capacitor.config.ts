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
    // Edge-to-edge on every Android, with the web layer owning the safe areas
    // (app.css spaces everything by the insets Capacitor injects). The old
    // overlaysWebView:false boxed the WebView out of the status bar with a
    // deprecated API while core's SystemBars was already going edge-to-edge
    // and injecting real insets — the spacing was applied twice, leaving a
    // dead white band under the status bar and another above the Android
    // navigation bar (the tab bar looked lifted off the bottom).
    // style LIGHT = dark icons, over the app's white status-bar fill; on
    // Androids older than 15 the same config paints a solid white bar
    // instead, which looks identical.
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#FFFFFF',
    },
    SystemBars: {
      style: 'LIGHT',
      // index.html always serves viewport-fit=cover; saying so up front stops
      // the first layout from shifting once Capacitor detects it.
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
