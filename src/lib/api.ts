// Same-origin in the browser (next.config.ts rewrites /api/* to the backend, as vercel.json did);
// absolute on the server, where a relative URL has no origin to resolve against.
export const getApiUrl = (): string => {
  if (typeof window !== 'undefined') return '/api/inquiry/submit';
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || process.env.VITE_BACKEND_API_URL || 'https://getmeds-admin.vercel.app';
  return `${baseUrl.replace(/\/$/, '')}/api/inquiry/submit`;
};
