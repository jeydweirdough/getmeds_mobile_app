# Getmeds mobile app

The Getmeds Android app: catalogue, search, request list, account (sign-in by SMS code, points, patients, addresses, prescription wallet, reminders, PAP applications), chat and the order forms.

These screens used to live on getmeds.ph as an installable web app (PWA), which meant the website had app-only pages such as `/app-home` and redirected visitors based on how the page was opened. They now live only here. The website is only the website.

## How it works

- **The app is a single web page built with Vite + React, packaged by [Capacitor](https://capacitorjs.com)** into a native Android project (`android/`). Everything it shows is bundled inside the APK. Nothing is loaded from getmeds.ph to draw a screen.
- **Screens:** `src/platform/routes.ts` maps each address to a screen:

  | Address | Screen |
  |---|---|
  | `/` (also `/app-home`) | Home |
  | `/search` | Search |
  | `/cart` | Request list |
  | `/profile` (also `/account`) | Account |
  | `/chat` | Chat |
  | `/order-medicines`, `/order-medicines/<audience>` | Order forms |
  | `/product-range`, `/<category folder>`, `/conditions/<condition>` | Catalogue |
  | `/<category folder>/<product>` | Product page |

  Any other address (About us, the blog, policies, careers...) opens **getmeds.ph** in an in-app browser tab (`src/platform/navigation.ts`).
- **Data comes straight from the services.** The screens call `/api/...` and `/wp-json/...` just as on the website. `src/platform/http.ts` sends those calls to the backend and to WordPress, at the addresses set in `.env`.

  | Data | Service | Setting |
  |---|---|---|
  | Accounts, inquiries, points, chat bot | Admin backend | `NEXT_PUBLIC_BACKEND_API_URL` |
  | Health guides | WordPress | `NEXT_PUBLIC_WORDPRESS_API_ROOT` |
  | Products, categories, FAQ | Sanity (read only) | `NEXT_PUBLIC_SANITY_*` |
  | Website pages opened in-app | getmeds.ph | `NEXT_PUBLIC_SITE_URL` |
  | Form verification | Cloudflare Turnstile | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` |

  Everything in `.env` is built into the APK and can be read by anyone. Addresses and public keys only, never a token.

## One-time setup outside this repo

The app's pages have the origin `https://app.getmeds.ph` (set in `capacitor.config.ts`; nothing is hosted there). Two services check the origin and need it added once:

1. **Sanity:** manage.sanity.io → project `s7ocz8zp` → API → CORS origins → add `https://app.getmeds.ph`, *without* credentials. Until then the catalogue is empty on a phone.
2. **Cloudflare Turnstile:** Cloudflare dashboard → Turnstile → the Getmeds widget → Hostnames → add `app.getmeds.ph`. Until then the sign-in code and the order forms can't be sent from a phone.

The backend and WordPress already accept the app's origin.

## Develop

```bash
npm install
cp .env.example .env    # then fill in NEXT_PUBLIC_TURNSTILE_SITE_KEY
npm run dev             # http://localhost:5173
```

Use a phone-sized window. Sanity already accepts `http://localhost:5173`, so development works without the setup above.

## Build the APK

You need [Android Studio](https://developer.android.com/studio), which brings the Android SDK and Java 21.

```bash
npm run android         # builds the web part, copies it into android/, opens Android Studio
```

In Android Studio:
- **To try it:** Run on a phone or emulator.
- **For the Play Store:** Build → Generate Signed App Bundle / APK.

After any change under `src/`, run `npm run cap:sync` to update `android/`.

### Replacing the app already on the stores

`appId` is `com.getmeds.ph`, the id of the Getmeds app already listed (2MG Incorporated). To publish this build as an update to that listing you need:

- access to that Google Play Console account;
- the app's signing key, or Play App Signing enabled on it;
- a `versionCode` in `android/app/build.gradle` higher than the listed one. It is currently `120` / `1.2.0`; check the Play Console before uploading.

Keep the upload keystore out of git; `.gitignore` already excludes `*.jks` and `*.keystore`.

## Keeping in step with the website

Most of `src/` is copied from `getmeds-frontend-v2`, at the same paths, so a fix there can be copied over file for file. The copies differ from the website in only these places:

- `src/lib/cart.ts`: `isAppMode()` always returns `true`.
- `src/app/app-home/AppHomeClient.tsx`: no check that it is running as an installed PWA.
- `src/lib/pwaMode.tsx`: not copied. It only served the PWA.

These files are the app's own:

- `src/platform/*`: settings, service addresses, link handling, and the stand-ins for `next/link` and `next/navigation`.
- `src/App.tsx`, `src/main.tsx`, `src/styles/*`.

The website no longer has the app-only screens (account, cart, search, chat, app home). From now on they are maintained here, not there.

## Not in this version

- **iPhone.** Capacitor can build it (`npx cap add ios`, on a Mac), but Apple rejects apps that are mostly a website. The iOS listing needs its own decision.
- **Offline catalogue.** The PWA's service worker cached product data for offline browsing. The app works offline for its own screens, and inquiries sent offline are still queued, but the catalogue needs a connection the first time.
