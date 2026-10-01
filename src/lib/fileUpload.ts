// Shared client-side guard for prescription/ID/attachment uploads (order-medicines,
// product-detail). The `accept` attribute on <input type="file"> is only a picker
// hint and is trivially bypassed (drag-and-drop, "All Files"), so real enforcement
// happens here too — and again on the backend, since client-side checks can always
// be skipped entirely by calling the API directly.

export const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
export const ALLOWED_FILE_TYPES_ACCEPT = ALLOWED_FILE_EXTENSIONS.join(',');
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per file
export const MAX_FILE_SIZE_LABEL = '10MB';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex === -1 ? '' : fileName.slice(dotIndex).toLowerCase();
}

export function isFileTypeAllowed(file: File): boolean {
  if (!ALLOWED_FILE_EXTENSIONS.includes(getExtension(file.name))) return false;
  // Some browsers/OSes leave `file.type` blank for docx and a few image formats —
  // only reject on a mismatch when a type WAS reported, rather than trusting an
  // empty type as a bypass.
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) return false;
  return true;
}

export interface FileValidationResult {
  valid: File[];
  errors: string[];
}

export function validateFiles(files: File[]): FileValidationResult {
  const valid: File[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (!isFileTypeAllowed(file)) {
      errors.push(`"${file.name}" isn't an allowed file type. Allowed: PDF, DOCX, PNG, JPG, JPEG, GIF, WEBP, BMP.`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push(`"${file.name}" is larger than the ${MAX_FILE_SIZE_LABEL} limit.`);
      continue;
    }
    if (file.size === 0) {
      errors.push(`"${file.name}" is empty.`);
      continue;
    }
    valid.push(file);
  }

  return { valid, errors };
}

/**
 * Strips the "data:...;base64," prefix, which is what the inquiry endpoint
 * expects. Product-detail defined this inline; sharing it keeps the cart's
 * uploads byte-identical to the ones the website already sends.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
  })
}

/**
 * Vercel rejects any request body over ~4.5 MB with a 413 before the function
 * runs, so an oversized upload never reaches the inquiry endpoint at all — no
 * row, no email, and nothing in the server logs to explain it. A single phone
 * photo is routinely 2-5 MB, and base64 adds a further third on top, so a
 * request carrying one prescription per product plus a valid ID exceeds the
 * limit almost immediately.
 *
 * Redrawing through a canvas at a sane resolution brings a typical photo down
 * to a few hundred KB with no meaningful loss for reading a prescription, and
 * it also makes the upload far quicker on mobile data.
 *
 * Anything that is not an image (a PDF, say) is returned untouched — there is
 * no safe lossless way to shrink one here — so callers must still check the
 * total size.
 */
export async function compressImage(
  file: File,
  { maxEdge = 1600, quality = 0.72 }: { maxEdge?: number; quality?: number } = {}
): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    // Already small enough to be worth leaving alone.
    if (scale === 1 && file.size < 600 * 1024) return file

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (!blob || blob.size >= file.size) return file // never make it bigger

    const renamed = file.name.replace(/[.][^.]+$/, '') + '.jpg'
    return new File([blob], renamed, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file // an unreadable image is the caller's problem, not this one's
  }
}

/** Roughly what a base64 payload of these files will weigh, in bytes. */
export function estimateUploadBytes(files: File[]): number {
  return files.reduce((total, f) => total + Math.ceil(f.size * 4 / 3), 0)
}

/** Comfortably under Vercel's ~4.5 MB body limit, leaving room for the JSON. */
export const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024
