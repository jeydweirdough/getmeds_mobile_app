import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import '@fontsource/poppins/300.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@/app/globals.css';
import '@/styles/app.css';
import '@/styles/consent.css';
import { installServiceRouting } from '@/platform/http';
import { installLinkHandling } from '@/platform/navigation';
import App from './App';

// Before any screen runs: relative /api and /wp-json calls go to the real services, and links
// to website-only pages open in the in-app browser.
installServiceRouting();
installLinkHandling();

createRoot(document.getElementById('root')!).render(<App />);

if (Capacitor.isNativePlatform()) {
  // The first screen is on the way; the splash can go.
  requestAnimationFrame(() => { SplashScreen.hide().catch(() => undefined); });
}
