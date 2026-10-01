import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('./src', import.meta.url));

// The screens are copied from getmeds-frontend-v2 (a Next.js app), so they read their settings as
// process.env.NEXT_PUBLIC_*. Only NEXT_PUBLIC_* values are handed to the app: everything in this
// bundle ships inside the APK, where anyone can read it, so no token may ever go in here.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const publicEnv: Record<string, string> = { NODE_ENV: mode === 'production' ? 'production' : 'development' };
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('NEXT_PUBLIC_')) publicEnv[key] = value;
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        // The few Next.js APIs the screens use, answered by plain-browser versions.
        { find: /^next\/link$/, replacement: `${src}/platform/next-link.tsx` },
        { find: /^next\/navigation$/, replacement: `${src}/platform/next-navigation.ts` },
        { find: /^@\//, replacement: `${src}/` },
      ],
    },
    define: {
      'process.env': JSON.stringify(publicEnv),
    },
    server: {
      // Sanity only answers the origins listed in its CORS settings; localhost:5173 is one of them.
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
    },
  };
});
