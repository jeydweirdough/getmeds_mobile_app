import { useMemo } from 'react';
import { CatalogueRow, prettyFolder, productImage } from '@/lib/catalogueItem';
import { useLang } from '@/lib/i18n';

/**
 * CategoryCard.tsx
 * ─────────────────────────────────────────────
 * The coloured category card, shared by the home screen's swipe strip and the
 * Categories screen's stacked list, so the two always draw the same card.
 */

const BRAND = '#1D9FDA';

// Cards cycle through these so neighbours never share a colour. The first hex
// in each is also the colour of the card's icon.
const CATEGORY_CARD_COLORS = [
  'linear-gradient(135deg,#1D9FDA 0%,#2F7FD6 100%)',
  'linear-gradient(135deg,#7B5CF0 0%,#9A6BF2 100%)',
  'linear-gradient(135deg,#4E9C4A 0%,#61A644 100%)',
  'linear-gradient(135deg,#0A2A43 0%,#14507A 100%)',
  'linear-gradient(135deg,#E8784A 0%,#F09A4E 100%)',
  'linear-gradient(135deg,#0F9C9C 0%,#22B3A8 100%)',
];
// Product photos in each card's avatar stack; the rest show as "+N".
const CATEGORY_AVATARS = 3;

const FOLDER_ICON: Record<string, string> = {
  'cancer-medicines': 'fa-ribbon',
  'blood-disorder-medicines': 'fa-droplet',
  'antibiotics': 'fa-shield-virus',
  'heart-medicines': 'fa-heart-pulse',
  'anemia-medicines': 'fa-droplet',
  'diabetes-medicines': 'fa-syringe',
  'bone-health-medicines': 'fa-bone',
  'allergy-medicines': 'fa-hand-dots',
  'pain-management': 'fa-pills',
  'kidney-medicines': 'fa-kit-medical',
  'brain-cancer-medicines': 'fa-brain',
  'hormonal-therapy': 'fa-flask',
  'contrast-media': 'fa-x-ray',
  'anti-inflammatory-medicines': 'fa-fire',
};

export type CategoryInfo = { count: number; images: string[] };

/**
 * Every category folder in the catalogue, biggest first, with a few product
 * photos for the card's avatar stack. Folders whose products have no image
 * attached yet just show the count.
 */
export function useCatalogueCategories(products: CatalogueRow[]): [string, CategoryInfo][] {
  return useMemo(() => {
    const acc = new Map<string, CategoryInfo>();
    for (const p of products) {
      const f = (p.categoryFolder || '').trim();
      if (!f) continue;
      const cur = acc.get(f) || { count: 0, images: [] };
      cur.count += 1;
      if (cur.images.length < CATEGORY_AVATARS && p.image && p.image.asset) cur.images.push(productImage(p, 96));
      acc.set(f, cur);
    }
    return [...acc.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [products]);
}

/**
 * One category card. `index` picks the colour; `className` sets the width and
 * any snap behaviour, which is the only thing the strip and the list disagree on.
 */
export function CategoryCard({
  folder,
  info,
  index,
  className = '',
}: {
  folder: string;
  info: CategoryInfo;
  index: number;
  className?: string;
}) {
  const { tr } = useLang();
  const name = prettyFolder(folder).replace(' Medicines', '');
  const extra = info.count - info.images.length;
  const bg = CATEGORY_CARD_COLORS[index % CATEGORY_CARD_COLORS.length];
  return (
    <a
      href={`/${folder}`}
      className={`relative flex h-[178px] flex-col overflow-hidden rounded-[22px] p-4 text-white transition active:scale-[0.98] ${className}`}
      style={{ background: bg }}
      aria-label={tr(
        `${name}, ${info.count} ${info.count === 1 ? 'medicine' : 'medicines'}. View`,
        `${name}, ${info.count} gamot. Tingnan`,
      )}
    >
      {/* Soft rings in the top-right corner, as in the slider. */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full border border-white/15" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-4 -top-6 h-20 w-20 rounded-full bg-white/10" />

      <div className="relative flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
          <i className={`fa-solid ${FOLDER_ICON[folder] || 'fa-pills'} text-[16px]`} style={{ color: bg.match(/#[0-9A-Fa-f]{6}/)?.[0] || BRAND }} />
        </span>
      </div>

      <div className="relative mt-2.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[19px] font-semibold leading-[1.15]">{name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-white/85">
            <i className="fa-solid fa-capsules text-[10px]" />
            {tr(`${info.count} ${info.count === 1 ? 'medicine' : 'medicines'}`, `${info.count} gamot`)}
          </p>
        </div>
        {info.images.length > 0 && (
          <div className="flex shrink-0 items-center">
            {info.images.map((src, j) => (
              <span
                key={src}
                className="flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white"
                style={{ marginLeft: j === 0 ? 0 : -10 }}
              >
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-contain p-0.5"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              </span>
            ))}
            {extra > 0 && (
              <span
                className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-white bg-white/25 text-[11px] font-semibold backdrop-blur"
                style={{ marginLeft: -10 }}
              >
                +{extra}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="relative mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="flex min-w-0 items-center gap-2 rounded-full bg-white/15 py-1.5 pl-1.5 pr-3 text-[10.5px] leading-tight text-white/90">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20">
            <i className="fa-solid fa-file-prescription text-[10px]" />
          </span>
          <span className="truncate">{tr('Request with your Rx', 'Mag-request gamit ang Rx mo')}</span>
        </span>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[12px] font-semibold"
          style={{ color: '#172B4D' }}
        >
          {tr('View', 'Tingnan')}
          <i className="fa-solid fa-angles-right text-[10px]" style={{ color: BRAND }} />
        </span>
      </div>
    </a>
  );
}
