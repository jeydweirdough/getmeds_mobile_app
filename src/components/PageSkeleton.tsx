/**
 * PageSkeleton.tsx
 * ─────────────────────────────────────────────
 * What a screen shows while it has nothing to draw yet, instead of a blank
 * white page. Grey shapes in the layout the real screen is about to have, so
 * the content lands where the eye already is.
 *
 *   list    a header, a search-sized bar and a column of cards (most screens)
 *   detail  a big image, a title block and a couple of rows (a product page)
 *
 * index.html has a plain-HTML copy of the list variant for the moment before
 * the app's code has loaded; keep the two roughly alike.
 */

const Bone = ({ className }: { className: string }) => <div className={`animate-pulse rounded-xl bg-[#EEF1F5] ${className}`} />;

export default function PageSkeleton({ variant = 'list' }: { variant?: 'list' | 'detail' }) {
  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-white px-4 pt-4" aria-busy="true" aria-label="Loading">
      {variant === 'detail' ? (
        <>
          <div className="mb-4 flex items-center gap-3">
            <Bone className="h-10 w-10 rounded-full" />
            <Bone className="h-4 w-32" />
          </div>
          <Bone className="aspect-square w-full rounded-[22px]" />
          <Bone className="mt-5 h-6 w-3/4" />
          <Bone className="mt-2.5 h-4 w-1/2" />
          <div className="mt-4 flex gap-2">
            <Bone className="h-6 w-12 rounded-full" />
            <Bone className="h-6 w-20 rounded-full" />
          </div>
          <Bone className="mt-6 h-[52px] w-full rounded-full" />
          <Bone className="mt-6 h-4 w-full" />
          <Bone className="mt-2 h-4 w-11/12" />
          <Bone className="mt-2 h-4 w-4/5" />
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <Bone className="h-9 w-28" />
            <Bone className="h-10 w-10 rounded-full" />
          </div>
          <Bone className="h-[46px] w-full rounded-full" />
          <Bone className="mt-5 h-[150px] w-full rounded-[20px]" />
          <Bone className="mt-6 h-5 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mt-3 flex items-center gap-3 rounded-[16px] p-2.5">
              <Bone className="h-[58px] w-[58px] shrink-0" />
              <div className="flex-1">
                <Bone className="h-4 w-3/4" />
                <Bone className="mt-2 h-3 w-1/2" />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
