/**
 * ProductName.tsx
 * ─────────────────────────────────────────────
 * A product name with its bracketed part — usually the generic name, e.g.
 * "GemGet 200 (Gemcitabine (as Hydrochloride))" — flowing on the same line
 * in black, a size smaller, so the brand name still reads first. Names
 * without brackets render as they are. Takes the heading's own size and
 * weight.
 */

const GENERIC = '#111827';

export default function ProductName({ name }: { name: string }) {
  const i = name.indexOf('(');
  if (i <= 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, i).trim()}{' '}
      {/* A size down and slightly tighter, so the pair fits in fewer lines. */}
      <span style={{ color: GENERIC, fontSize: '0.78em', letterSpacing: '-0.01em' }}>{name.slice(i).trim()}</span>
    </>
  );
}
