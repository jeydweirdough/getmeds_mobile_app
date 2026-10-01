type PreloadEntry = { key: string; data: unknown }

let cache: Record<string, PreloadEntry> | null | undefined

function readAll(): Record<string, PreloadEntry> | null {
  if (cache !== undefined) return cache ?? null
  cache = null
  try {
    const el = typeof document !== 'undefined' ? document.getElementById('gm-preload') : null
    if (el && el.textContent) cache = JSON.parse(el.textContent)
  } catch {
    cache = null
  }
  return cache ?? null
}

export function readPreload<T>(kind: string, key: string | null | undefined): T | undefined {
  if (!key) return undefined
  const entry = readAll()?.[kind]
  return entry && entry.key === key ? (entry.data as T) : undefined
}
