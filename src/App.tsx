import { useEffect, useMemo } from 'react';
import AppHomeClient from '@/app/app-home/AppHomeClient';
import SearchClient from '@/app/search/SearchClient';
import CategoriesClient from '@/app/categories/CategoriesClient';
import CartClient from '@/app/cart/CartClient';
import AccountClient from '@/app/account/AccountClient';
import NotificationsClient from '@/app/notifications/NotificationsClient';
import ChatClient from '@/app/chat/ChatClient';
import OrderMedicinesClient from '@/app/order-medicines/[audience]/OrderMedicinesClient';
import CatalogClient from '@/components/CatalogClient';
import ProductDetailClient from '@/components/ProductDetailClient';
import ChromeExtras from '@/components/ChromeExtras';
import Onboarding from '@/components/Onboarding';
import GuidedTour from '@/components/GuidedTour';
import PwaTabbar from '@/lib/PwaTabbar';
import { QueuedInquiryNotice } from '@/lib/QueuedInquiryNotice';
import { useCategories } from '@/lib/useSanity';
import { resolveRoute, type Route } from '@/platform/routes';
import { leaveUnknownScreen, openOnWebsite } from '@/platform/navigation';
import { navigate, useLocation } from '@/platform/router';
import PageSkeleton from '@/components/PageSkeleton';
import { useLang } from '@/lib/i18n';
import '@/app/app-home/app-home.css';
import '@/app/chat/chat.css';

const TITLES: Partial<Record<Route['screen'], { en: string; tl: string }>> = {
  home: { en: 'Getmeds', tl: 'Getmeds' },
  search: { en: 'Search | Getmeds', tl: 'Maghanap | Getmeds' },
  categories: { en: 'Categories | Getmeds', tl: 'Mga Kategorya | Getmeds' },
  cart: { en: 'Your Request List | Getmeds', tl: 'Ang Iyong Request List | Getmeds' },
  account: { en: 'My Account | Getmeds', tl: 'Aking Account | Getmeds' },
  notifications: { en: 'Notifications | Getmeds', tl: 'Mga Notification | Getmeds' },
  chat: { en: 'Chat with Getmeds | Getmeds', tl: 'Mag-chat sa Getmeds | Getmeds' },
  order: { en: 'Order Medicines | Getmeds', tl: 'Mag-order ng Gamot | Getmeds' },
};

const slugify = (value: string) => String(value || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

/**
 * "/<folder>/<slug>" is a condition listing or a product page. The website decides on the server
 * from the catalogue; here the same check runs against the live categories: a slug that names a
 * condition (a category's subcategory) is the listing, anything else is a product.
 */
function CatalogOrProduct({ prefix, slug }: { prefix: string; slug: string }) {
  const { data: categories, loading } = useCategories();
  if (loading) return <PageSkeleton variant="detail" />;
  const target = slug.toLowerCase();
  const isCondition = (categories || []).some((c) =>
    (c.subcategory || []).some((s) => s.toLowerCase() === target || slugify(s) === target),
  );
  return isCondition ? <CatalogClient /> : <ProductDetailClient categorySlug={prefix} productSlug={slug} />;
}

function WebsitePage({ path }: { path: string }) {
  useEffect(() => {
    openOnWebsite(path);
    leaveUnknownScreen();
  }, [path]);
  return <PageSkeleton />;
}

function Screen({ route }: { route: Route }) {
  switch (route.screen) {
    case 'home':
      return (
        <div className="gm-page-app-home text-gray-800 antialiased" data-page="app-home">
          <AppHomeClient />
          <QueuedInquiryNotice />
        </div>
      );
    case 'search':
      return <SearchClient />;
    case 'categories':
      return <CategoriesClient />;
    case 'cart':
      return <CartClient />;
    case 'account':
      return (
        <div className="text-gray-800 antialiased" data-page="profile">
          <AccountClient />
          <QueuedInquiryNotice />
        </div>
      );
    case 'notifications':
      return <NotificationsClient />;
    case 'chat':
      return (
        <div className="gm-page-chat" data-page="chat">
          <ChatClient />
          <QueuedInquiryNotice />
        </div>
      );
    case 'order':
      return <OrderMedicinesClient audienceSlug={route.audience} />;
    case 'catalog':
      return <CatalogClient />;
    case 'catalog-or-product':
      return <CatalogOrProduct prefix={route.prefix} slug={route.slug} />;
    case 'redirect':
      return null;
    case 'website':
      return <WebsitePage path={route.path} />;
  }
}

export default function App() {
  const location = useLocation();
  const { tr, lang } = useLang();
  // Keyed by the router's screen key, not the full address: a same-path change
  // (search's ?q=, an account sub-screen) is the mounted screen's own business.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const route = useMemo(() => resolveRoute(location.pathname), [location.key]);

  useEffect(() => {
    if (route.screen === 'redirect') navigate(route.to, { replace: true });
  }, [route]);

  useEffect(() => {
    const title = TITLES[route.screen];
    if (title) document.title = tr(title.en, title.tl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, lang]);

  return (
    <>
      <div className="gm-statusbar-fill" aria-hidden="true" />
      {/* gm-screen: the safe-area spacing (app.css). gm-screen-in: the fade, taken
          off once it has played: while an element has an opacity animation it is
          its own stacking layer, which kept every sheet and modal inside the page
          (inquiry form, prescription prompts) underneath the tab bar. */}
      <main
        key={location.key}
        className="gm-screen gm-screen-in"
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.classList.remove('gm-screen-in');
        }}
      >
        <Screen route={route} />
      </main>
      <PwaTabbar />
      <ChromeExtras />
      <Onboarding />
      <GuidedTour />
    </>
  );
}
