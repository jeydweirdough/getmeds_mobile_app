'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BRAND, PrimaryButton, Sheet, Toast, useToast } from './ui/Screen';
import { REWARDS_CHANGED_EVENT, RewardsError, authedCall, call, isSignedIn } from './rewards';
import PointsCard, { usePoints } from './PointsCard';
import { SignInSheet } from './ProfileCard';
import { useLang, translate } from './i18n';

/**
 * ProductReviews.tsx
 * ─────────────────────────────────────────────
 * Star ratings and reviews on the app's product page (the website does not show
 * them). Backed by GET/POST /api/reviews/<slug> (backend review_service.py):
 *
 * - Anyone sees the approved reviews and the star summary.
 * - A customer can write one review per medicine once they have requested it
 *   through the app; it shows "Requested via Getmeds".
 * - Every new or edited review waits for staff approval in the Studio, so it
 *   is not public, and not in the stars, until then. The author sees theirs as
 *   "Waiting for approval".
 */

const STAR = '#F5A623';
const MAX_TEXT = 1000;
const MIN_TEXT = 10;

export interface ReviewItem {
  rating: number;
  text: string;
  name: string;
  verified: boolean;
  date?: string;
}

export interface ReviewsData {
  average: number;
  count: number;
  distribution: Record<string, number>;
  reviews: ReviewItem[];
  /** Null for guests. */
  me: { review: { rating: number; text: string; status: 'pending' | 'approved' | 'rejected'; createdAt?: string } | null; canReview: boolean } | null;
}

const message = (e: unknown) => (e instanceof RewardsError ? e.message : translate('Something went wrong. Please try again.', 'May nangyaring mali. Pakisubukan ulit.'));
const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** One fetch per product page, shared by the star line and the section; refreshes on sign-in and out. */
export function useReviews(slug: string | undefined): { data: ReviewsData | null; reload: () => void } {
  const [data, setData] = useState<ReviewsData | null>(null);
  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const path = `/reviews/${encodeURIComponent(slug)}`;
      // Signed in: the backend also says whether this customer may review it.
      setData(isSignedIn() ? await authedCall<ReviewsData>(path) : await call<ReviewsData>(path));
    } catch {
      setData((d) => d); // keep what was shown; the section simply stays as it was
    }
  }, [slug]);
  useEffect(() => {
    setData(null);
    load();
    window.addEventListener(REWARDS_CHANGED_EVENT, load);
    return () => window.removeEventListener(REWARDS_CHANGED_EVENT, load);
  }, [load]);
  return { data, reload: load };
}

export function Stars({ value, size = 12 }: { value: number; size?: number }) {
  const { tr } = useLang();
  return (
    <span className="inline-flex items-center gap-[2px]" aria-label={tr(`${value} out of 5 stars`, `${value} sa 5 na bituin`)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = value >= n ? 'fa-solid fa-star' : value >= n - 0.5 ? 'fa-solid fa-star-half-stroke' : 'fa-regular fa-star';
        return <i key={n} className={icon} style={{ color: STAR, fontSize: size }} />;
      })}
    </span>
  );
}

/** "★ 4.6 · 12 reviews" under the product name; taps through to the reviews. */
export function RatingLine({ data }: { data: ReviewsData | null }) {
  const { tr } = useLang();
  if (!data) return <div className="mt-2 h-4 w-32 animate-pulse rounded bg-gray-100" />;
  return (
    <button
      type="button"
      onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      className="mt-2 flex items-center gap-2 text-[12.5px] text-gray-500"
    >
      {data.count > 0 ? (
        <>
          <i className="fa-solid fa-star text-[12px]" style={{ color: STAR }} />
          <span className="font-semibold text-gray-900">{data.average.toFixed(1)}</span>
          <span className="h-3 w-px bg-gray-300" />
          <span>
            {data.count} {data.count === 1 ? tr('review', 'review') : tr('reviews', 'na review')}
          </span>
        </>
      ) : (
        <>
          <i className="fa-regular fa-star text-[12px]" style={{ color: STAR }} />
          <span>{tr('No reviews yet', 'Wala pang review')}</span>
        </>
      )}
    </button>
  );
}

function WriteReviewSheet({
  slug,
  productName,
  existing,
  onClose,
  onSaved,
}: {
  slug: string;
  productName: string;
  existing: { rating: number; text: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(existing?.rating || 0);
  const [text, setText] = useState(existing?.text || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { tr } = useLang();
  const labels = [
    '',
    tr('Poor', 'Hindi maganda'),
    tr('Fair', 'Pwede na'),
    tr('Good', 'Maganda'),
    tr('Very good', 'Napakaganda'),
    tr('Excellent', 'Sobrang ganda'),
  ];

  const save = async () => {
    setError('');
    if (!rating) return setError(tr('Tap the stars to rate it.', 'I-tap ang mga bituin para mag-rate.'));
    if (text.trim().length < MIN_TEXT) return setError(tr(`Tell others a little more (at least ${MIN_TEXT} characters).`, `Magkuwento pa nang kaunti (hindi bababa sa ${MIN_TEXT} na character).`));
    setBusy(true);
    try {
      await authedCall(`/reviews/${encodeURIComponent(slug)}`, {
        method: 'POST',
        body: JSON.stringify({ rating, text: text.trim(), productName }),
      });
      onSaved();
    } catch (e) {
      setError(message(e));
    }
    setBusy(false);
  };

  return (
    <Sheet title={existing ? tr('Edit your review', 'I-edit ang iyong review') : tr('Write a review', 'Sumulat ng review')} onClose={onClose}>
      <p className="px-1 text-[12.5px] leading-relaxed text-gray-500">{productName}</p>
      <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-white py-4">
        <div className="flex gap-2" role="radiogroup" aria-label={tr('Your rating', 'Ang iyong rating')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={tr(`${n} star${n === 1 ? '' : 's'}`, `${n} bituin`)}
              onClick={() => setRating(n)}
              className="p-1"
            >
              <i className={`${rating >= n ? 'fa-solid' : 'fa-regular'} fa-star text-[28px]`} style={{ color: STAR }} />
            </button>
          ))}
        </div>
        <p className="h-4 text-[12px] font-semibold text-gray-600">{labels[rating]}</p>
      </div>
      <div className="rounded-2xl bg-white p-3">
        <textarea
          aria-label={tr('Your review', 'Ang iyong review')}
          rows={5}
          maxLength={MAX_TEXT}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={tr('How was getting this medicine through Getmeds? Availability, delivery, how the team helped…', 'Kumusta ang pagkuha mo ng gamot na ito sa Getmeds? Availability, delivery, paano tumulong ang team…')}
          className="w-full resize-none text-[13.5px] text-gray-800 outline-none"
        />
        <p className="text-right text-[11px] text-gray-400">
          {text.length}/{MAX_TEXT}
        </p>
      </div>
      <p className="px-1 text-[11.5px] leading-relaxed text-gray-500">
        {tr(
          'Please don’t give medical advice or share personal health details. Reviews are checked by our team before they appear. For side effects, contact your doctor and message us so we can report it.',
          'Huwag magbigay ng medical advice o magbahagi ng personal na detalye tungkol sa kalusugan. Sinusuri ng aming team ang mga review bago ito lumabas. Kung may side effect, kumonsulta sa iyong doktor at i-message kami para mai-report namin ito.',
        )}
      </p>
      {error && <p className="px-1 text-[12px] text-red-500">{error}</p>}
      <PrimaryButton onClick={save} disabled={busy}>
        {busy ? tr('Sending…', 'Ipinapadala…') : existing ? tr('Update review', 'I-update ang review') : tr('Submit review', 'Ipadala ang review')}
      </PrimaryButton>
    </Sheet>
  );
}

/** The reviews section at the foot of the product page. */
export function ReviewsSection({
  slug,
  productName,
  data,
  reload,
}: {
  slug: string;
  productName: string;
  data: ReviewsData | null;
  reload: () => void;
}) {
  const points = usePoints();
  const [writing, setWriting] = useState(false);
  const [askSignIn, setAskSignIn] = useState(false);
  const [note, setNote] = useState('');
  const [toast, showToast] = useToast();
  const { tr } = useLang();

  // Signed in from the sheet this section opened: carry on to writing if allowed.
  useEffect(() => {
    if (askSignIn && points.signedIn) setAskSignIn(false);
  }, [askSignIn, points.signedIn]);

  const mine = data?.me?.review || null;

  const onWrite = () => {
    setNote('');
    if (!points.signedIn) {
      setAskSignIn(true);
      return;
    }
    if (!data?.me) return; // still loading the signed-in view
    if (!data.me.canReview) {
      setNote(tr('You can review a medicine after you’ve requested it through the Getmeds app.', 'Puwede kang mag-review ng gamot kapag na-request mo na ito sa Getmeds app.'));
      return;
    }
    setWriting(true);
  };

  const max = Math.max(1, ...Object.values(data?.distribution || {}));

  return (
    <section id="reviews" className="scroll-mt-20 border-t border-[#EEF1F5] bg-white px-4 pb-6 pt-6" aria-label={tr('Ratings and reviews', 'Mga rating at review')}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[16px] font-medium tracking-tight text-gray-900">{tr('Ratings & reviews', 'Mga rating at review')}</h2>
        <button type="button" onClick={onWrite} className="text-[12.5px] font-semibold" style={{ color: BRAND }}>
          {mine ? tr('Edit your review', 'I-edit ang iyong review') : tr('Write a review', 'Sumulat ng review')}
        </button>
      </div>

      {!data ? (
        <div className="h-24 animate-pulse rounded-2xl bg-gray-100" />
      ) : (
        <>
          {/* Summary: the average on the left, how the stars spread on the right. */}
          <div className="flex items-center gap-5 rounded-[18px] bg-[#F6F8FC] p-4">
            <div className="text-center">
              <p className="text-[34px] font-bold leading-none text-gray-900">{data.count ? data.average.toFixed(1) : '–'}</p>
              <div className="mt-1.5">
                <Stars value={data.average} size={11} />
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                {data.count} {data.count === 1 ? tr('review', 'review') : tr('reviews', 'na review')}
              </p>
            </div>
            <div className="flex-1 space-y-1">
              {[5, 4, 3, 2, 1].map((n) => {
                const c = data.distribution[String(n)] || 0;
                return (
                  <div key={n} className="flex items-center gap-2 text-[11px] text-gray-500">
                    <span className="w-2.5 text-right">{n}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full" style={{ width: `${(c / max) * 100}%`, background: STAR }} />
                    </div>
                    <span className="w-5 text-right">{c}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {mine && mine.status !== 'approved' && (
            <p className="mt-3 flex gap-2 rounded-2xl bg-[#FFF8E6] px-3.5 py-3 text-[12px] leading-snug text-[#8A6100]" role="status">
              <i className="fa-solid fa-hourglass-half mt-[3px] text-[11px]" />
              <span>
                {mine.status === 'pending'
                  ? tr('Thanks! Your review is waiting for approval and will appear once our team has checked it.', 'Salamat! Naghihintay pa ng approval ang iyong review at lalabas ito kapag nasuri na ng aming team.')
                  : tr('Your review wasn’t published. You can edit it and send it again.', 'Hindi na-publish ang iyong review. Puwede mo itong i-edit at ipadala ulit.')}
              </span>
            </p>
          )}
          {note && (
            <p className="mt-3 flex gap-2 rounded-2xl bg-[#F1F8FE] px-3.5 py-3 text-[12px] leading-snug text-gray-600" role="status">
              <i className="fa-solid fa-circle-info mt-[3px] text-[11px]" style={{ color: BRAND }} />
              <span>{note}</span>
            </p>
          )}

          {data.reviews.length === 0 ? (
            <p className="mt-4 text-center text-[12.5px] text-gray-500">
              {tr(
                'No reviews yet. Requested this medicine through Getmeds? Be the first to review it.',
                'Wala pang review. Na-request mo ba ang gamot na ito sa Getmeds? Ikaw ang maunang mag-review.',
              )}
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-[#EEF1F5]">
              {data.reviews.map((r, i) => (
                <li key={i} className="py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EAF4FB] text-[12px] font-semibold" style={{ color: BRAND }}>
                        {(r.name || 'G').charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-[12.5px] font-semibold text-gray-900">{r.name}</p>
                        {r.verified && (
                          <p className="text-[10.5px] font-medium text-[#357A3F]">
                            <i className="fa-solid fa-circle-check mr-1" />
                            {tr('Requested via Getmeds', 'Na-request sa Getmeds')}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400">{when(r.date)}</span>
                  </div>
                  <div className="mt-2">
                    <Stars value={r.rating} size={11} />
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-gray-700">{r.text}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {writing && (
        <WriteReviewSheet
          slug={slug}
          productName={productName}
          existing={mine ? { rating: mine.rating, text: mine.text } : null}
          onClose={() => setWriting(false)}
          onSaved={() => {
            setWriting(false);
            showToast(tr('Thanks! Your review will appear once approved.', 'Salamat! Lalabas ang iyong review kapag na-approve na.'));
            reload();
          }}
        />
      )}
      <SignInSheet open={askSignIn && !points.signedIn} onClose={() => setAskSignIn(false)}>
        <PointsCard
          points={points}
          bare
          initialMode="login"
          intro={tr("Log in to review medicines you've requested through Getmeds.", 'Mag-log in para i-review ang mga gamot na na-request mo sa Getmeds.')}
        />
      </SignInSheet>
      <Toast text={toast} />
    </section>
  );
}
