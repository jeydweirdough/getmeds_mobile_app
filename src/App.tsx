import { useEffect, useMemo } from 'react';
import AppHomeClient from '@/app/app-home/AppHomeClient';
import SearchClient from '@/app/search/SearchClient';
import CartClient from '@/app/cart/CartClient';
import AccountClient from '@/app/account/AccountClient';
import ChatClient from '@/app/chat/ChatClient';
import OrderMedicinesClient from '@/app/order-medicines/[audience]/OrderMedicinesClient';
import CatalogClient from '@/components/CatalogClient';
import ProductDetailClient from '@/components/ProductDetailClient';
import ChromeExtras from '@/components/ChromeExtras';
import PwaTabbar from '@/lib/PwaTabbar';
import { QueuedInquiryNotice } from '@/lib/QueuedInquiryNotice';
import { useCategories } from '@/lib/useSanity';
import { resolveRoute, type Route } from '@/platform/routes';
import { leaveUnknownScreen, openOnWebsite } from '@/platform/navigation';
import '@/app/app-home/app-home.css';
import '@/app/chat/chat.css';

const TITLES: Partial<Record<Route['screen'], string>> = {
  home: 'Getmeds',
  search: 'Search | Getmeds',
  cart: 'Your Request List | Getmeds',
  account: 'My Account | Getmeds',
  chat: 'Chat with Getmeds | Getmeds',
  order: 'Order Medicines | Getmeds',
};

const slugify = (value: string) => String(value || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

/**
 * "/<folder>/<slug>" is a condition listing or a product page. The website decides on the server
 * from the catalogue; here the same check runs against the live categories: a slug that names a
 * condition (a category's subcategory) is the listing, anything else is a product.
 */
function CatalogOrProduct({ prefix, slug }: { prefix: string; slug: string }) {
  const { data: categories, loading } = useCategories();
  if (loading) return <div className="min-h-screen bg-white" aria-busy="true" />;
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
  return <div className="min-h-screen bg-white" />;
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
    case 'cart':
      return <CartClient />;
    case 'account':
      return (
        <div className="text-gray-800 antialiased" data-page="profile">
          <AccountClient />
          <QueuedInquiryNotice />
        </div>
      );
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
  const route = useMemo(() => resolveRoute(window.location.pathname), []);

  useEffect(() => {
    if (route.screen === 'redirect') window.location.replace(route.to);
    const title = TITLES[route.screen];
    if (title) document.title = title;
  }, [route]);

  return (
    <>
      <main>
        <Screen route={route} />
      </main>
      <PwaTabbar />
      <ChromeExtras />
    </>
  );
}
