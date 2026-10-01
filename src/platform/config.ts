/**
 * Where the app's data comes from. Set in .env (see .env.example) and built into the APK.
 *
 * On the website these calls are same-origin: getmeds.ph proxies /api/* to the backend and
 * /wp-json/* to WordPress. The app has no server of its own, so it calls each service directly.
 */
const trim = (url: string | undefined, fallback: string) => (url || fallback).replace(/\/+$/, '');

/** Admin backend (FastAPI): accounts, inquiries, analytics, chatbot. */
export const API_BASE = trim(process.env.NEXT_PUBLIC_BACKEND_API_URL, 'https://getmeds-admin.vercel.app');

/** WordPress: health guides and their images. */
export const WORDPRESS_ROOT = trim(process.env.NEXT_PUBLIC_WORDPRESS_API_ROOT, 'https://cms.getmeds.ph');

/** The public website, for pages the app does not have its own screen for. */
export const SITE_URL = trim(process.env.NEXT_PUBLIC_SITE_URL, 'https://getmeds.ph');
