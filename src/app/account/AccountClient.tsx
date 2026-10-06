'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { hasConsent, isAppMode, setConsent, clearAllDeviceData, CART_CHANGED_EVENT } from '@/lib/cart';
import {
  ACCOUNT_CHANGED_EVENT,
  deleteInquiry,
  listInquiries,
  loadDetails,
  purgeDocuments,
  saveDetails,
  type InquiryRecord,
  type SavedDetails,
} from '@/lib/accountStore';
import { compressImage, fileToBase64 } from '@/lib/fileUpload';
import { USER_TYPES, typeByValue } from '@/lib/audienceTypes';
import AlertModal from '@/lib/AlertModal';
import PointsCard, { usePoints } from '@/lib/PointsCard';
import ProfileCard, { GuestCard, GuestList, SignInSheet } from '@/lib/ProfileCard';
import DetailsScreen from '@/lib/DetailsScreen';
import { saveProfile, useAccountData, manilaToday, addDays, type Profile } from '@/lib/accountApi';
import { Card, ListRow, Sheet, Toast, useToast } from '@/lib/ui/Screen';
import { LANGUAGES, translate, useLang } from '@/lib/i18n';
import PatientsScreen from '@/lib/account/PatientsScreen';
import AddressesScreen from '@/lib/account/AddressesScreen';
import RxWalletScreen from '@/lib/account/RxWalletScreen';
import SavedScreen from '@/lib/account/SavedScreen';
import RemindersScreen from '@/lib/account/RemindersScreen';
import RequestsScreen from '@/lib/account/RequestsScreen';
import RewardsScreen from '@/lib/account/RewardsScreen';
import PapScreen from '@/lib/account/PapScreen';
import GuidesScreen from '@/lib/account/GuidesScreen';
import PrivacyScreen from '@/lib/account/PrivacyScreen';
import { captureReferralFromUrl, inviteLink, signOut as signOutOfPoints } from '@/lib/rewards';
import { goTo } from '@/platform/navigation';

/**
 * account.tsx
 * ─────────────────────────────────────────────
 * The account screen, rebuilt around what this business actually does.
 *
 * What it replaced was a marketplace template — order-fulfilment tabs (To Pay,
 * To Ship, To Receive), a voucher wallet, a loyalty currency, a star-rating
 * button, a "seller", and one hardcoded chemotherapy order priced at ₱1,840
 * reduced from ₱2,100. None of it was real. Getmeds has no checkout, no
 * vouchers, no coins, no ratings and publishes no prices, so every one of
 * those was a promise the app could never keep, on the page where a patient
 * goes to check something important.
 *
 * The two things here are what an inquiry business can honestly offer, and
 * each is backed by data that genuinely exists:
 *
 *   Inquiries   recorded on this device as each one is sent — see accountStore.
 *   Details     the answers to the long form, kept so it is filled once.
 *
 * Storing a prescription and an ID here was tried and removed: the inquiry
 * forms need one prescription per prescription-only medicine, checked against
 * that specific item, so a single file kept on a profile could not be attached
 * correctly anyway. Uploading still happens in the form, where the file and
 * the medicine it belongs to are chosen together.
 *
 * Everything is per-device and gated on the same consent the request list
 * asks for. That is stated plainly at the bottom rather than buried, because a
 * history of requested medicines is health information and the person holding
 * the phone should know where it lives.
 */

const GROUND = '#F3F6FB';
const BRAND = '#1D9FDA';

type Tab = 'inquiries' | 'details';

interface LocalUser {
  name?: string;
  email?: string;
  avatar?: string;
}

const readUser = (): LocalUser | null => {
  try {
    const raw = window.localStorage.getItem('getmeds_user');
    return raw ? (JSON.parse(raw) as LocalUser) : null;
  } catch {
    return null;
  }
};

const when = (ms: number) =>
  new Date(ms).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * What an inquiry's status means to the person who sent it.
 *
 * Deliberately only two, because only two are knowable from here: it reached
 * Getmeds, or it is still waiting for a connection. A "being quoted" or
 * "quoted" state would need the server to tell us, and /api/inquiry/submit is
 * submit-only. Inventing those states is how the page got into trouble before.
 */
const STATUS: Record<InquiryRecord['status'], { label: string; labelTl: string; note: string; noteTl: string; bg: string; fg: string }> = {
  sent: {
    label: 'Sent',
    labelTl: 'Naipadala',
    note: 'Our team replies with availability and a quote.',
    noteTl: 'Sasagot ang team namin tungkol sa availability at quote.',
    bg: '#ECFAF0',
    fg: '#357A3F',
  },
  queued: {
    label: 'Waiting to send',
    labelTl: 'Naghihintay maipadala',
    note: 'Saved on this device. It goes automatically once you are back online.',
    noteTl: 'Naka-save sa device na ito. Kusa itong maipapadala kapag online ka na ulit.',
    bg: '#FFF6E6',
    fg: '#9A6412',
  },
};

function Segmented({ tab, setTab, counts }: { tab: Tab; setTab: (t: Tab) => void; counts: Record<Tab, number> }) {
  const { tr } = useLang();
  const items: Array<{ id: Tab; label: string }> = [
    { id: 'inquiries', label: tr('Inquiries', 'Mga inquiry') },
    { id: 'details', label: tr('Details', 'Mga detalye') },
  ];
  return (
    <div className="mb-5 flex gap-1 rounded-full p-1" style={{ background: GROUND }}>
      {items.map((it) => {
        const on = tab === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => setTab(it.id)}
            aria-pressed={on}
            className="flex-1 rounded-full py-2.5 text-[12.5px] font-semibold transition"
            style={on ? { background: BRAND, color: '#fff' } : { color: '#6B7280' }}
          >
            {it.label}
            {counts[it.id] > 0 && (
              <span className={`ml-1.5 text-[11px] ${on ? 'text-white/80' : 'text-gray-400'}`}>{counts[it.id]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const SCREENS = ['patients', 'addresses', 'wallet', 'saved', 'reminders', 'requests', 'rewards', 'pap', 'guides', 'privacy'] as const;
type ScreenKey = (typeof SCREENS)[number];

/** My details as the account keeps it: everything but the picture. */
function profileOf(d: SavedDetails): Profile {
  const { avatar: _avatar, savedAt: _savedAt, ...rest } = d;
  return rest as Profile;
}

function Account() {
  const [app] = useState(isAppMode);
  const [user, setUser] = useState<LocalUser | null>(null);
  const [tab, setTab] = useState<Tab>('inquiries');
  const [consented, setConsented] = useState<boolean | null>(null);

  const [inquiries, setInquiries] = useState<InquiryRecord[] | null>(null);
  const [details, setDetails] = useState<SavedDetails>({});
  const [savedFlash, setSavedFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<{ title?: string; message: string | string[] } | null>(null);
  const points = usePoints();
  const [signInOpen, setSignInOpen] = useState(false);
  const { lang, setLang, tr } = useLang();
  const [langOpen, setLangOpen] = useState(false);
  // Which form the sign-in sheet opens on; screens that need an account open it on Sign up.
  const [signInMode, setSignInMode] = useState<'signup' | 'login'>('signup');
  // Why the sheet opened, when a feature needing an account sent the guest there.
  const [signInIntro, setSignInIntro] = useState<string | undefined>(undefined);
  /** Opens Create account (with `intro` saying what it unlocks) for a guest. */
  const askToSignIn = (intro?: string) => {
    setSignInMode('signup');
    setSignInIntro(intro);
    setSignInOpen(true);
  };
  /**
   * A guest in the app sees a short list instead of the tabs, and opens one
   * section at a time; everything else about the account needs signing in.
   */
  const [guestOpen, setGuestOpen] = useState<Tab | null>(null);
  /** The app's full-screen "My details"; the website keeps the Details tab. */
  const [detailsOpen, setDetailsOpen] = useState(false);
  const closeDetails = useCallback(() => setDetailsOpen(false), []);
  /** Which full-screen page is open. Each also opens from a link: /profile#<key>. */
  const [screen, setScreen] = useState<ScreenKey | null>(null);
  const closeScreen = useCallback(() => setScreen(null), []);
  const account = useAccountData();
  const [toast, showToast] = useToast();

  const refresh = useCallback(async () => {
    setConsented(await hasConsent());
    setInquiries(await listInquiries());
  }, []);

  /**
   * Details load once, deliberately outside refresh().
   *
   * refresh() re-runs on every account change — adding a document fires it —
   * and re-reading the saved copy there would replace whatever the visitor had
   * typed into the form but not yet saved. After the first load the form owns
   * its own state.
   */
  useEffect(() => {
    let alive = true;
    loadDetails().then((stored) => {
      if (alive && stored) setDetails((d) => ({ ...d, ...stored }));
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    document.title = translate('My Account | Getmeds', 'Aking Account | Getmeds');
    if (app) document.body.style.background = '#FFFFFF';
    setUser(readUser());
    // /edit-profile redirects here with #details, so the old "Edit Profile"
    // links from the navbar, the blog and the homepage land on the form
    // rather than on the inquiry list.
    if (window.location.hash === '#details') {
      if (app) setDetailsOpen(true);
      else setTab('details');
    }
    const fromHash = window.location.hash.slice(1) as ScreenKey;
    if (app && (SCREENS as readonly string[]).includes(fromHash)) setScreen(fromHash);
    // An invite link (?ref=GM…) — kept for the points card to offer.
    captureReferralFromUrl();
    // Clears any prescriptions or IDs saved while the account screen could
    // still store files. Nothing writes them now, so this finds nothing on
    // every visit after the first — but it must run, because leaving them
    // behind would mean personal documents sitting on a phone with no screen
    // left that could show or delete them.
    purgeDocuments();
    refresh();

    window.addEventListener(ACCOUNT_CHANGED_EVENT, refresh);
    window.addEventListener(CART_CHANGED_EVENT, refresh);

    // The navbar and footer placeholders the original filled here are rendered
    // by the root layout in Next.js.

    return () => {
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, refresh);
      window.removeEventListener(CART_CHANGED_EVENT, refresh);
      // Screens now switch in place, so the tint must not follow us to the next one.
      if (app) document.body.style.background = '';
    };
  }, [refresh, app]);

  // Seed the form from whatever the account already knows, so a first visit is
  // not an empty form when the name and email are sitting in localStorage.
  useEffect(() => {
    if (!user) return;
    setDetails((d) => ({
      ...d,
      name: d.name || user.name || '',
      email: d.email || user.email || '',
    }));
  }, [user]);

  /**
   * For a signed-in customer, My details lives with Getmeds so it follows
   * them to another phone. The first time the account loads: if it already
   * has details, they fill the form; if not, whatever this phone had saved
   * is sent up once. The picture stays on the phone either way.
   */
  const profileSynced = React.useRef(false);
  useEffect(() => {
    if (!app || !points.signedIn || !account.data || profileSynced.current) return;
    profileSynced.current = true;
    const server = account.data.profile || {};
    if (Object.values(server).some((v) => String(v ?? '').trim())) {
      setDetails((d) => ({ ...d, ...server }));
    } else if (details.name || details.phone) {
      saveProfile(profileOf(details)).catch(() => { /* retried on the next save */ });
    }
  }, [app, points.signedIn, account.data, details]);

  const counts = useMemo(
    () => ({ inquiries: inquiries?.length ?? 0, details: 0 }),
    [inquiries]
  );

  const grant = async () => {
    await setConsent(true);
    await refresh();
  };

  const persistDetails = async (): Promise<boolean> => {
    setBusy(true);
    const ok = await saveDetails(details);
    setBusy(false);
    if (!ok) {
      setAlert({
        title: tr('Not saved', 'Hindi na-save'),
        message: tr(
          'Getmeds needs your permission to keep these details on this device.',
          'Kailangan ng Getmeds ang pahintulot mo para i-save ang mga detalyeng ito sa device na ito.',
        ),
      });
      return false;
    }

    /**
     * Mirror the display name and picture into the `getmeds_user` entry the
     * navbar and auth UI read — but ONLY if one already exists.
     *
     * Writing that key when it is absent would manufacture a signed-in session
     * for someone who never signed in, and the navbar would start showing them
     * as logged into an account that does not exist. Saving your name should
     * not silently log you in.
     */
    try {
      const current = readUser();
      if (current) {
        const next: LocalUser = {
          ...current,
          name: details.name || current.name,
          avatar: details.avatar || current.avatar,
        };
        window.localStorage.setItem('getmeds_user', JSON.stringify(next));
        setUser(next);
        const w = window as unknown as { updateAuthUI?: () => void };
        if (typeof w.updateAuthUI === 'function') w.updateAuthUI();
      }
    } catch {
      /* storage blocked — the details themselves are already saved */
    }

    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2200);
    return true;
  };

  /** Avatar picking. Downscaled hard: this is displayed at 52px. */
  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAlert({ title: tr('Not an image', 'Hindi ito larawan'), message: tr('Choose a PNG or JPG for your picture.', 'Pumili ng PNG o JPG para sa picture mo.') });
      return;
    }
    setBusy(true);
    try {
      const small = await compressImage(file, { maxEdge: 256, quality: 0.8 });
      const b64 = await fileToBase64(small);
      setDetails((d) => ({ ...d, avatar: `data:${small.type || 'image/jpeg'};base64,${b64}` }));
    } catch {
      setAlert({ title: tr('Could not read that image', 'Hindi mabasa ang larawang iyon'), message: tr('Try a different photo.', 'Sumubok ng ibang photo.') });
    }
    setBusy(false);
  };

  const wipe = async () => {
    await clearAllDeviceData();
    // The points session is on this device too; the points stay with Getmeds.
    signOutOfPoints();
    setDetails({});
    await refresh();
  };

  const field =
    'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-[#1D9FDA]';
  const label = 'block text-[12px] font-medium text-gray-500 mb-1.5';

  // What the visitor last saved wins over the auth entry: the details form is
  // now the only place either can be changed, so it is the fresher of the two.
  const displayName = details.name || user?.name || '';
  const avatar = details.avatar || user?.avatar;
  const initial = (displayName || 'U').charAt(0).toUpperCase();
  /** Decides which extra fields the form below even asks for. */
  const audience = typeByValue(details.userType);
  const audienceLabel = audience ? tr(audience.label, audience.labelTl ?? audience.label) : undefined;

  /**
   * How much of the details form is filled in, for the ring on the profile
   * card. Counts what "My details" requires: name, mobile, who is asking,
   * and the required fields for that type of customer. Optional fields and
   * the picture are left out, so a finished form reads 100%.
   */
  const completeness = useMemo(() => {
    // Email is optional on the form, so it is not counted here either.
    const keys = ['name', 'phone', 'userType', ...(audience?.fields.filter((f) => f.required).map((f) => f.key) ?? [])];
    const filled = keys.filter((k) => String((details as Record<string, unknown>)[k] ?? '').trim() !== '').length;
    return (filled / keys.length) * 100;
  }, [details, audience]);

  const guest = app && !points.signedIn;
  const acct = account.data;
  const today = manilaToday();
  const dueSoon = addDays(today, 1);
  const remindersDue = (acct?.refillReminders ?? []).filter((r) => r.active !== false && r.nextDue <= dueSoon).length;
  const rxAttention = (acct?.rx ?? []).filter((r) => r.expiresOn && r.expiresOn <= addDays(today, 30)).length;
  const papOpen = (acct?.pap ?? []).find((a) => ['submitted', 'reviewing', 'needs_info'].includes(a.status));
  const serverRequests = acct?.requests.length ?? 0;
  /** Screens that need an account send a guest to sign in instead. */
  const open = (key: ScreenKey) => {
    if (key !== 'guides' && !points.signedIn) {
      setSignInOpen(true);
      return;
    }
    setScreen(key);
  };
  const showSections = !guest || guestOpen !== null;

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const logout = () => {
    signOutOfPoints();
    const w = window as unknown as { logoutUser?: () => void };
    if (typeof w.logoutUser === 'function') w.logoutUser();
    window.location.href = '/';
  };

  /** Shares the invite link, or sends a guest to sign in first. */
  const invite = async () => {
    const code = points.summary?.account.referralCode;
    if (!code) {
      scrollTo('points');
      return;
    }
    const text = tr(
      `Get the Getmeds app and add my code ${code} under My account > Getmeds Points.`,
      `I-download ang Getmeds app at ilagay ang code kong ${code} sa My account > Getmeds Points.`,
    );
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Getmeds', text, url: inviteLink(code) });
      } else {
        await navigator.clipboard.writeText(`${text} ${inviteLink(code)}`);
        setAlert({
          title: tr('Invite copied', 'Nakopya ang imbitasyon'),
          message: tr('Paste it into a chat to send it to a friend.', 'I-paste ito sa chat para maipadala sa kaibigan.'),
        });
      }
    } catch {
      /* share sheet closed */
    }
  };

  const pointsAccount = points.summary?.account;
  // A new customer has a number before they have a name; never call someone
  // who just signed in "Guest".
  const profileName = displayName || pointsAccount?.name || '';
  const profileSubtitle = profileName
    ? [audienceLabel ?? tr('Getmeds member', 'Getmeds member'), pointsAccount?.mobile].filter(Boolean).join(' · ')
    : tr(
        `${audienceLabel ?? 'Getmeds member'} · Add your name in Edit profile`,
        `${audienceLabel ?? 'Getmeds member'} · Ilagay ang pangalan mo sa Edit profile`,
      );

  return (
    <>
      <main className={`mx-auto flex max-w-3xl flex-col ${app ? 'px-4 pb-8 pt-5' : 'px-6 pb-16 pt-28'}`}>
        {/* Identity. The app gets the profile card; the website keeps the
            plain row, since it has no points to show. */}
        {guest && (
          <>
            <GuestCard
              onSignIn={(mode) => {
                setSignInMode(mode);
                setSignInIntro(undefined);
                setSignInOpen(true);
              }}
            />
            <GuestList
              rows={[
                // Both need an account: requests and details are kept with it,
                // so they follow the customer to any phone.
                {
                  icon: 'fa-file-lines',
                  label: tr('My requests', 'Mga request ko'),
                  hint: tr('Log in', 'Mag-log in'),
                  onClick: () =>
                    askToSignIn(
                      tr(
                        'Log in or create a free account to see your requests and earn points on every one.',
                        'Mag-log in o gumawa ng libreng account para makita ang mga request mo at kumita ng points sa bawat isa.',
                      ),
                    ),
                },
                {
                  icon: 'fa-id-card',
                  label: tr('My details', 'Mga detalye ko'),
                  hint: tr('Log in', 'Mag-log in'),
                  onClick: () =>
                    askToSignIn(
                      tr(
                        'Log in or create a free account to keep your details and fill in request forms faster.',
                        'Mag-log in o gumawa ng libreng account para ma-save ang mga detalye mo at mas mabilis mapunan ang mga request form.',
                      ),
                    ),
                },
                { icon: 'fa-book-medical', label: tr('Health guides', 'Mga gabay sa kalusugan'), onClick: () => open('guides') },
                { icon: 'fa-comments', label: tr('Chat with us', 'Mag-chat sa amin'), onClick: () => { goTo('/chat'); } },
              ]}
            />
          </>
        )}
        {app && !guest && (
          <ProfileCard
            name={profileName || pointsAccount?.mobile || ''}
            subtitle={profileSubtitle}
            avatar={avatar}
            completeness={completeness}
            onEdit={() => setDetailsOpen(true)}
            stats={[
              {
                label: tr('Points', 'Points'),
                value: pointsAccount ? pointsAccount.pointsBalance.toLocaleString('en-PH') : '—',
                onClick: () => scrollTo('points'),
              },
              {
                label: tr('Requests', 'Mga request'),
                value: String(points.signedIn ? serverRequests : inquiries?.length ?? 0),
                onClick: () => {
                  setTab('inquiries');
                  window.setTimeout(() => scrollTo('account-tabs'), 50);
                },
              },
              {
                label: tr('Friends invited', 'Naimbitahan'),
                value: points.signedIn ? String(points.summary?.referral?.friendsJoined ?? 0) : '—',
                onClick: () => scrollTo('points'),
              },
            ]}
            // Inviting and logging out only mean something to a signed-in
            // customer; a guest gets the way in instead.
            actions={
              points.signedIn
                ? [
                    { icon: 'fa-share-nodes', label: tr('Invite a friend', 'Mag-imbita'), onClick: invite },
                    { icon: 'fa-headset', label: tr('Contact us', 'Kontakin kami'), onClick: () => { goTo('/contact-us'); } },
                    { icon: 'fa-arrow-right-from-bracket', label: tr('Log out', 'Mag-log out'), onClick: logout, tone: 'danger' },
                  ]
                : [
                    { icon: 'fa-right-to-bracket', label: tr('Sign in', 'Mag-log in'), onClick: () => { scrollTo('points'); document.getElementById('points-mobile')?.focus({ preventScroll: true }); } },
                    { icon: 'fa-headset', label: tr('Contact us', 'Kontakin kami'), onClick: () => { goTo('/contact-us'); } },
                  ]
            }
          />
        )}
        {!app && (
        <div className="mb-5 flex items-center gap-3.5 rounded-[18px] bg-white p-4">
          <span
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[20px] font-bold text-white"
            style={{ background: BRAND }}
          >
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-gray-900">{displayName || tr('Guest', 'Bisita')}</p>
            {/* Goes to the form on this page rather than /edit-profile. That
                page could only change a name, wrote to a different store than
                everything else here, and did nothing at all when nobody was
                signed in — two editors for one identity is the confusion this
                removes. */}
            <button
              type="button"
              onClick={() => setTab('details')}
              className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] font-semibold"
              style={{ color: BRAND }}
            >
              <i className="fa-solid fa-pen text-[9px]" /> {tr('Edit profile', 'I-edit ang profile')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              const w = window as unknown as { logoutUser?: () => void };
              if (typeof w.logoutUser === 'function') w.logoutUser();
              window.location.href = '/';
            }}
            className="shrink-0 rounded-full px-3 py-2 text-[12px] font-semibold text-red-500"
          >
            <i className="fa-solid fa-arrow-right-from-bracket mr-1.5 text-[11px]" />{tr('Logout', 'Mag-log out')}
          </button>
        </div>
        )}

        {/* Getmeds Points: an app-only feature, and the one thing on this
            screen that lives with Getmeds rather than on the phone. */}
        {app && !guest && <PointsCard points={points} />}
        {app && !guest && (
          <div className="mb-6 space-y-5">
            <Card title={tr('My account', 'Account ko')}>
              <ListRow icon="fa-id-card" title={tr('My details', 'Mga detalye ko')} detail={tr('Used to fill in your requests', 'Ginagamit para punan ang mga request mo')} hint={completeness >= 100 ? tr('Complete', 'Kumpleto') : `${Math.round(completeness)}%`} onClick={() => setDetailsOpen(true)} />
              <ListRow icon="fa-user-group" title={tr('Patients', 'Mga pasyente')} detail={tr('People you request medicines for', 'Mga taong pinagre-request-an mo ng gamot')} hint={acct?.patients.length || undefined} onClick={() => open('patients')} />
              <ListRow icon="fa-location-dot" title={tr('Delivery addresses', 'Mga delivery address')} hint={acct?.addresses.length || undefined} onClick={() => open('addresses')} />
              <ListRow icon="fa-file-prescription" title={tr('Prescription wallet', 'Wallet ng reseta')} detail={tr('Upload once, attach to any request', 'Isang upload lang, magagamit sa kahit anong request')} hint={rxAttention ? <span className="font-semibold text-amber-600">{tr(`${rxAttention} expiring`, `${rxAttention} malapit nang mag-expire`)}</span> : acct?.rx.length || undefined} onClick={() => open('wallet')} />
            </Card>
            <Card title={tr('Medicines', 'Mga gamot')}>
              <ListRow icon="fa-bookmark" title={tr('Saved medicines', 'Mga naka-save na gamot')} detail={tr('Get a text when one is back in stock', 'Ite-text ka namin kapag may stock na ulit')} hint={acct?.savedProducts.length || undefined} onClick={() => open('saved')} />
              <ListRow icon="fa-bell" title={tr('Refill reminders', 'Mga paalala sa refill')} detail={tr('We text you the day before', 'Ite-text ka namin isang araw bago')} hint={remindersDue ? <span className="font-semibold text-[#1D9FDA]">{tr(`${remindersDue} due`, `${remindersDue} kailangan na`)}</span> : acct?.refillReminders.length || undefined} onClick={() => open('reminders')} />
            </Card>
            <Card title={tr('Rewards and support', 'Rewards at suporta')}>
              <ListRow icon="fa-gift" title={tr('Rewards', 'Rewards')} detail={tr('Use your points', 'Gamitin ang points mo')} hint={pointsAccount ? `${pointsAccount.pointsBalance.toLocaleString('en-PH')} pts` : undefined} onClick={() => open('rewards')} />
              <ListRow icon="fa-hand-holding-heart" title={tr('Patient Assistance', 'Patient Assistance')} detail={papOpen ? tr('Application in progress', 'May application na pinoproseso') : tr('Support for long-course treatment', 'Suporta para sa pangmatagalang gamutan')} onClick={() => open('pap')} />
              <ListRow icon="fa-book-medical" title={tr('Health guides', 'Mga gabay sa kalusugan')} onClick={() => open('guides')} />
              <ListRow icon="fa-comments" title={tr('Chat with us', 'Mag-chat sa amin')} detail={tr('Ask about a medicine or a request', 'Magtanong tungkol sa gamot o request')} onClick={() => { goTo('/chat'); }} />
            </Card>
            <Card>
              <ListRow icon="fa-shield-halved" title={tr('Privacy and data', 'Privacy at data')} detail={tr('Download or delete your account', 'I-download o i-delete ang account mo')} onClick={() => open('privacy')} />
            </Card>
          </div>
        )}
        {/* Language — for everyone, guests included: it is a setting of the
            phone, not of the account, so it should never sit behind a sign-in. */}
        {app && (
          <div className="mb-6">
            <Card title={tr('Settings', 'Mga setting')}>
              <ListRow
                icon="fa-language"
                title={tr('Language', 'Wika')}
                detail={tr('Choose the language of the app', 'Piliin ang wika ng app')}
                hint={LANGUAGES.find((l) => l.value === lang)?.native}
                onClick={() => setLangOpen(true)}
              />
            </Card>
          </div>
        )}
        {langOpen && (
          <Sheet title={tr('Language', 'Wika')} onClose={() => setLangOpen(false)}>
            <Card>
              {LANGUAGES.map((l) => {
                const active = l.value === lang;
                return (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => { setLang(l.value); setLangOpen(false); }}
                    aria-pressed={active}
                    className="flex w-full items-center gap-3 border-b border-[#F1F3F6] px-4 py-3.5 text-left last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 text-[14px] font-medium text-gray-900">{l.native}</span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${active ? 'border-[#1D9FDA] bg-[#1D9FDA]' : 'border-gray-300'}`}
                    >
                      {active && <i className="fa-solid fa-check text-[9px] text-white" />}
                    </span>
                  </button>
                );
              })}
            </Card>
            <p className="px-1 text-[11.5px] leading-relaxed text-gray-500">
              {tr(
                'Medicine names, strengths and prescriptions stay as written, so they always match the box and your doctor’s prescription.',
                'Ang pangalan ng gamot, lakas, at reseta ay hindi isinasalin, para laging tugma sa kahon at sa reseta ng iyong doktor.',
              )}
            </p>
          </Sheet>
        )}
        {screen === 'patients' && <PatientsScreen onClose={closeScreen} />}
        {screen === 'addresses' && <AddressesScreen onClose={closeScreen} />}
        {screen === 'wallet' && <RxWalletScreen onClose={closeScreen} />}
        {screen === 'saved' && <SavedScreen onClose={closeScreen} />}
        {screen === 'reminders' && <RemindersScreen onClose={closeScreen} />}
        {screen === 'requests' && <RequestsScreen onClose={closeScreen} />}
        {screen === 'rewards' && <RewardsScreen onClose={closeScreen} />}
        {screen === 'pap' && <PapScreen onClose={closeScreen} />}
        {screen === 'guides' && <GuidesScreen onClose={closeScreen} />}
        {screen === 'privacy' && <PrivacyScreen onClose={closeScreen} onSignedOut={closeScreen} />}
        <Toast text={toast} />
        {detailsOpen && (
          <DetailsScreen
            details={details}
            setDetails={setDetails}
            avatar={avatar}
            onPickAvatar={onPickAvatar}
            onRemoveAvatar={() => setDetails((d) => ({ ...d, avatar: undefined }))}
            // A signed-in customer's details are kept with Getmeds, so no
            // on-phone permission is needed to save them.
            consented={points.signedIn ? true : consented}
            busy={busy}
            onClose={closeDetails}
            onSave={async () => {
              if (!points.signedIn) {
                if (consented === false) await grant();
                return persistDetails();
              }
              try {
                const bonus = await saveProfile(profileOf(details));
                if (bonus > 0) showToast(tr(`+${bonus} points for completing your details`, `+${bonus} points dahil kinumpleto mo ang mga detalye mo`));
              } catch (e) {
                setAlert({
                  title: tr('Not saved', 'Hindi na-save'),
                  message: (e as Error)?.message || tr('Check your connection and try again.', 'Tingnan ang connection mo at subukan ulit.'),
                });
                return false;
              }
              // The picture, and a copy for offline forms, stay on the phone.
              if (consented) await persistDetails();
              return true;
            }}
          />
        )}
        <SignInSheet open={signInOpen && guest} onClose={() => setSignInOpen(false)}>
          <PointsCard key={`${signInMode}:${signInIntro || ''}`} points={points} bare initialMode={signInMode} intro={signInIntro} />
        </SignInSheet>

        {consented === false && showSections && (
          <div className="mb-5 rounded-[18px] bg-white p-4">
            <p className="text-[13.5px] font-semibold text-gray-900">{tr('Keep your details on this phone?', 'I-save ang mga detalye mo sa phone na ito?')}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-gray-500">
              {tr(
                'Your inquiries and saved details stay on this device. Nothing is sent to Getmeds until you submit a request, and you can erase all of it below at any time.',
                'Mananatili sa device na ito ang mga inquiry at naka-save na detalye mo. Walang ipapadala sa Getmeds hangga’t hindi ka nagsusumite ng request, at puwede mong burahin lahat sa ibaba anumang oras.',
              )}
            </p>
            <button
              type="button"
              onClick={grant}
              className="mt-3 rounded-full px-5 py-2.5 text-[12.5px] font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#1D9FDA,#61A644)' }}
            >
              {tr('Allow and save', 'Payagan at i-save')}
            </button>
          </div>
        )}

        <div id="account-tabs" className="scroll-mt-4">
          {guest ? (
            showSections && (
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[15px] font-semibold text-gray-900">
                  {tab === 'inquiries'
                    ? tr('Requests sent from this phone', 'Mga request na ipinadala mula sa phone na ito')
                    : tr('Saved details for forms', 'Mga naka-save na detalye para sa form')}
                </p>
                <button type="button" onClick={() => setGuestOpen(null)} className="text-[12.5px] font-semibold text-gray-400">
                  {tr('Close', 'Isara')}
                </button>
              </div>
            )
          ) : app ? (
            <p className="mb-3 px-1 text-[15px] font-semibold text-gray-900">
              {tr('Your requests', 'Mga request mo')}
              {(points.signedIn ? serverRequests : counts.inquiries) > 0 && (
                <span className="ml-1.5 text-[12px] font-medium text-gray-400">{points.signedIn ? serverRequests : counts.inquiries}</span>
              )}
            </p>
          ) : (
            <Segmented tab={tab} setTab={setTab} counts={counts} />
          )}
        </div>

        {/* ── Inquiries ─────────────────────────────────────────────────── */}
        {app && !guest && <RequestsScreen embedded />}

        {tab === 'inquiries' && showSections && !(app && !guest) && (
          <section>
            {inquiries === null ? (
              <div className="space-y-2.5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-[92px] animate-pulse rounded-[16px] bg-gray-100" />
                ))}
              </div>
            ) : inquiries.length === 0 ? (
              <div className="rounded-[18px] bg-white p-7 text-center">
                <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F6FC]">
                  <i className="fa-solid fa-file-lines text-[18px]" style={{ color: BRAND }} />
                </span>
                <p className="text-[14px] font-semibold text-gray-900">{tr('No inquiries yet', 'Wala pang inquiry')}</p>
                <p className="mx-auto mt-1.5 max-w-[300px] text-[12px] leading-relaxed text-gray-500">
                  {tr(
                    'When you send a request for a quote, it will appear here so you can see what you asked for and when.',
                    'Kapag nagpadala ka ng request para sa quote, lalabas ito rito para makita mo kung ano at kailan ka nag-request.',
                  )}
                </p>
                <a
                  href="/search"
                  className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12.5px] font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg,#1D9FDA,#61A644)' }}
                >
                  <i className="fa-solid fa-magnifying-glass text-[11px]" /> {tr('Find a medicine', 'Maghanap ng gamot')}
                </a>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {inquiries.map((q) => {
                  const s = STATUS[q.status];
                  return (
                    <li key={q.id} className="rounded-[16px] bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-semibold text-gray-900">
                            {q.inquiryType || 'Inquiry'}
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-gray-400">{when(q.submittedAt)}</p>
                        </div>
                        <span
                          className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold"
                          style={{ background: s.bg, color: s.fg }}
                        >
                          {tr(s.label, s.labelTl)}
                        </span>
                      </div>

                      {q.products.length > 0 && (
                        <ul className="mt-2.5 space-y-1">
                          {q.products.map((p, i) => (
                            <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-gray-700">
                              <i className="fa-solid fa-capsules mt-[3px] text-[10px] text-gray-300" />
                              <span className="min-w-0 flex-1">{p}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <p className="mt-2.5 text-[11.5px] leading-relaxed text-gray-400">{tr(s.note, s.noteTl)}</p>

                      <div className="mt-3 flex items-center gap-3 border-t border-gray-50 pt-3">
                        <a href="/contact-us" className="text-[12px] font-semibold" style={{ color: BRAND }}>
                          {tr('Follow up', 'Mag-follow up')}
                        </a>
                        <span className="text-gray-200">·</span>
                        <button
                          type="button"
                          onClick={() => deleteInquiry(q.id)}
                          className="text-[12px] font-semibold text-gray-400"
                        >
                          {tr('Remove from history', 'Alisin sa history')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* The programme is real and people come looking for it, so it
                belongs here — but it has no application form anywhere in the
                app, so there is no status to show and none is implied. */}
            <a
              href="/patient-assistance-program"
              className="mt-4 flex items-center gap-3.5 rounded-[18px] bg-white p-4"
            >
              <img src="/assets/pap-logo-sm.png" alt="Patient Assistance Program" loading="lazy" className="h-[38px] w-auto shrink-0" />
              <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-gray-500">
                {tr('Support programmes for long-course treatment', 'Mga programang suporta para sa pangmatagalang gamutan')}
              </span>
              <i className="fa-solid fa-chevron-right shrink-0 text-[12px] text-gray-300" />
            </a>
          </section>
        )}

        {/* ── Details ───────────────────────────────────────────────────── */}
        {tab === 'details' && showSections && !app && (
          <section className="rounded-[18px] bg-white p-4">
            <p className="text-[13.5px] font-semibold text-gray-900">{tr('Your details', 'Mga detalye mo')}</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">
              {tr(
                'Saved on this phone and used to fill in inquiry forms, so you do not type them again every time.',
                'Naka-save sa phone na ito at ginagamit para punan ang mga inquiry form, para hindi mo na i-type ulit tuwing magre-request.',
              )}
            </p>

            <div className="mt-4 space-y-3.5">
              <div className="flex items-center gap-3.5">
                <span
                  className="flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[21px] font-bold text-white"
                  style={{ background: BRAND }}
                >
                  {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initial}
                </span>
                <div className="flex flex-wrap gap-2">
                  <label className="cursor-pointer rounded-full border border-gray-200 px-3.5 py-2 text-[12px] font-semibold text-gray-600">
                    {avatar ? tr('Change picture', 'Palitan ang picture') : tr('Add a picture', 'Magdagdag ng picture')}
                    <input type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
                  </label>
                  {avatar && (
                    <button
                      type="button"
                      onClick={() => setDetails((d) => ({ ...d, avatar: undefined }))}
                      className="rounded-full px-3 py-2 text-[12px] font-semibold text-gray-400"
                    >
                      {tr('Remove', 'Alisin')}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className={label}>{tr('Full name', 'Buong pangalan')}</label>
                <input className={field} value={details.name || ''} onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))} />
              </div>
              <div>
                <label className={label}>Mobile number</label>
                <input
                  className={field}
                  inputMode="tel"
                  placeholder="+63 900 000 0000"
                  value={details.phone || ''}
                  onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value.replace(/[^\d+\s\-()]/g, '') }))}
                />
              </div>
              <div>
                <label className={label}>Email address</label>
                <input className={field} type="email" value={details.email || ''} onChange={(e) => setDetails((d) => ({ ...d, email: e.target.value }))} />
              </div>

              {/* Who is asking. This is the field that earns the rest: it picks
                  which columns below are even relevant, and it decides which
                  spreadsheet an inquiry lands in — so answering it once here
                  lets the request list stop asking it every time. */}
              <div>
                <label className={label}>{tr('I am a', 'Ako ay')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {USER_TYPES.map((t) => {
                    const on = details.userType === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setDetails((d) => ({ ...d, userType: t.value }))}
                        className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[12px] font-semibold transition"
                        style={
                          on
                            ? { borderColor: BRAND, background: '#F1F8FE', color: BRAND }
                            : { borderColor: '#E5E7EB', color: '#6B7280' }
                        }
                      >
                        <i className={`fa-solid ${t.icon} shrink-0 text-[13px]`} />
                        <span className="leading-tight">{tr(t.label, t.labelTl ?? t.label)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Driven by the audience definition rather than hardcoded, so a
                  column added to one of the sheets shows up here and in the
                  inquiry form from the same edit. */}
              {audience?.fields.map((f) => (
                <div key={f.key}>
                  <label className={label}>{tr(f.label, f.labelTl ?? f.label)}</label>
                  {f.key === 'address' ? (
                    <textarea
                      rows={2}
                      className={`${field} resize-none`}
                      value={details.address || ''}
                      onChange={(e) => setDetails((d) => ({ ...d, address: e.target.value }))}
                    />
                  ) : f.key === 'age' ? (
                    <input
                      className={field}
                      inputMode="numeric"
                      value={details.age || ''}
                      onChange={(e) => setDetails((d) => ({ ...d, age: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                    />
                  ) : (
                    <input
                      className={field}
                      value={(details[f.key] as string) || ''}
                      onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}

              {/* Patients are the only audience whose sheet has these columns. */}
              {audience?.kind === 'patient' && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className={label}>Contact person</label>
                    <input className={field} value={details.contactName || ''} onChange={(e) => setDetails((d) => ({ ...d, contactName: e.target.value }))} />
                  </div>
                  <div className="flex-1">
                    <label className={label}>{tr('Relationship', 'Kaugnayan')}</label>
                    <input className={field} placeholder={tr('e.g. Daughter', 'hal. Anak')} value={details.contactRelationship || ''} onChange={(e) => setDetails((d) => ({ ...d, contactRelationship: e.target.value }))} />
                  </div>
                </div>
              )}

              {!audience && (
                <p className="text-[11.5px] leading-relaxed text-gray-400">
                  {tr(
                    'Choose one above and we’ll keep only the details that audience is actually asked for.',
                    'Pumili ng isa sa itaas at itatabi lang namin ang mga detalyeng talagang kailangan para doon.',
                  )}
                </p>
              )}
            </div>

            {/* When permission is missing, this asks for it and then saves in
                the same tap. The alternative — letting Save fail and
                explaining why afterwards — makes the visitor do the work of
                connecting a refusal to a notice further up the page. */}
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (consented === false) await grant();
                await persistDetails();
              }}
              className="mt-5 w-full rounded-full py-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
              style={{ background: savedFlash ? '#61A644' : 'linear-gradient(135deg,#1D9FDA,#61A644)' }}
            >
              {savedFlash
                ? tr('✓ Saved on this device', '✓ Na-save sa device na ito')
                : busy
                  ? tr('Saving…', 'Sine-save…')
                  : consented === false
                    ? tr('Allow and save on this device', 'Payagan at i-save sa device na ito')
                    : tr('Save details', 'I-save ang mga detalye')}
            </button>
          </section>
        )}

        {/* Privacy — stated plainly rather than buried, because what is stored
            here says which medicines someone has asked for. */}
        <div className="mt-8 border-t border-gray-200 pt-4">
          {app && points.signedIn ? (
            <p className="text-[11.5px] leading-relaxed text-gray-400">
              {tr(
                'Your details, patients, addresses, saved medicines, reminders, prescriptions and request history are kept with Getmeds, so they are there on any phone you sign in on. Your picture and your request list stay on this phone. See Privacy and data to download or delete everything.',
                'Ang mga detalye, pasyente, address, naka-save na gamot, paalala, reseta at request history mo ay nasa Getmeds, kaya makikita mo ang mga ito sa kahit anong phone na pag-log-in-an mo. Ang picture at request list mo ay nananatili sa phone na ito. Pumunta sa Privacy at data para i-download o i-delete ang lahat.',
              )}
            </p>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-gray-400">
              {tr(
                'Your inquiries and details are stored on this device only. They are not sent to Getmeds until you submit a request, and they will not appear on your other devices.',
                'Sa device na ito lang naka-store ang mga inquiry at detalye mo. Hindi ito ipapadala sa Getmeds hangga’t hindi ka nagsusumite ng request, at hindi ito lalabas sa iba mong device.',
              )}
              {app &&
                tr(
                  ' If you sign in, they are kept with Getmeds instead, so they follow you to any phone.',
                  ' Kapag nag-log in ka, sa Getmeds na ito itatabi, kaya kasama mo ito sa kahit anong phone.',
                )}
            </p>
          )}
          <button type="button" onClick={wipe} className="mt-3 text-[12px] font-semibold text-gray-400 underline">
            {tr('Clear saved data on this device', 'Burahin ang naka-save na data sa device na ito')}
          </button>
        </div>
      </main>

      <AlertModal open={!!alert} onClose={() => setAlert(null)} title={alert?.title} message={alert?.message ?? ''} />
    </>
  );
}

/**
 * The original page was rendered entirely in the browser (an empty #root in
 * profile.html), and almost everything it reads at first render (app mode,
 * the points session, a pending referral) lives in window/localStorage. It is
 * mounted after hydration for the same reason, so the server and the first
 * client render agree.
 */
export default function AccountClient() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Account /> : null;
}
