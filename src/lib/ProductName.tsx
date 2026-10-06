/**
 * ProductName.tsx
 * ─────────────────────────────────────────────
 * A product name with its bracketed part — usually the generic name, e.g.
 * "GemGet 200 (Gemcitabine (as Hydrochloride))" — on its own line in brand
 * blue, so the brand name reads first and the generic sits under it. Names
 * without brackets render as they are. Takes the heading's own size and weight,
 * with the blue line a size smaller.
 */

const BRAND = '#1D9FDA';

export default function ProductName({ name }: { name: string }) {
  const i = name.indexOf('(');
  if (i <= 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, i).trim()}
      <br />
      {/* A size down and slightly tighter, so most generics fit on one line. */}
      <span style={{ color: BRAND, fontSize: '0.78em', letterSpacing: '-0.01em' }}>{name.slice(i).trim()}</span>
    </>
  );
}
