import { extname, resolve, sep } from 'node:path';

export const UPLOAD_FILENAME_CODEC_VERSION = 'upload-filename-v1';
export const UPLOAD_FILENAME_MAX_DISPLAY_BYTES = 1024;
export const UPLOAD_FILENAME_MAX_STORAGE_BYTES = 180;
export const UTF8_MULTIPART_FILE_OPTIONS = {
  defParamCharset: 'utf8',
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
};

export const FILENAME_REVIEW_CODES = {
  ambiguousEncoding: 'FILENAME_REVIEW_AMBIGUOUS_ENCODING',
  empty: 'FILENAME_REVIEW_EMPTY',
  invalidUtf8: 'FILENAME_REVIEW_INVALID_UTF8_TRANSPORT',
  tooLong: 'FILENAME_REVIEW_TOO_LONG',
  unsafeCharacters: 'FILENAME_REVIEW_UNSAFE_CHARACTERS',
} as const;

export type FilenameReviewCode =
  (typeof FILENAME_REVIEW_CODES)[keyof typeof FILENAME_REVIEW_CODES];

export interface CanonicalUploadFilename {
  transportFilename: string;
  originalFilename: string;
  storageBasename: string;
  codecVersion: typeof UPLOAD_FILENAME_CODEC_VERSION;
  reviewCode: FilenameReviewCode | null;
  recoveredTransportEncoding: boolean;
  normalized: boolean;
}

const MOJIBAKE_EVIDENCE = /[\u0080-\u009f]|Ã|Â|â|ð/u;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

export function canonicalizeUploadFilename(
  transportFilename: string,
  expectedExtension: string,
  fileSha256: string,
): CanonicalUploadFilename {
  const raw = transportFilename ?? '';
  const recovered = recoverReversibleMojibake(raw, expectedExtension);
  const beforeNormalization = recovered.value;
  const canonical = beforeNormalization.normalize('NFC');
  const normalized = canonical !== beforeNormalization;
  const reviewCode = reviewFilename(
    raw,
    canonical,
    recovered.ambiguous,
  );

  return {
    transportFilename: raw,
    originalFilename: canonical,
    storageBasename: storageSafeBasename(
      canonical,
      expectedExtension,
      fileSha256,
    ),
    codecVersion: UPLOAD_FILENAME_CODEC_VERSION,
    reviewCode,
    recoveredTransportEncoding: recovered.recovered,
    normalized,
  };
}

export function projectCanonicalFilename(
  persistedFilename: string,
  expectedExtension: string,
): Pick<
  CanonicalUploadFilename,
  'originalFilename' | 'reviewCode' | 'recoveredTransportEncoding' | 'normalized'
> {
  const result = canonicalizeUploadFilename(
    persistedFilename,
    expectedExtension,
    'legacy-projection',
  );
  return {
    originalFilename: result.originalFilename,
    reviewCode: result.reviewCode,
    recoveredTransportEncoding: result.recoveredTransportEncoding,
    normalized: result.normalized,
  };
}

export function assertStorageContainment(
  directory: string,
  storageBasename: string,
): string {
  const resolvedDirectory = resolve(directory);
  const target = resolve(resolvedDirectory, storageBasename);
  if (!target.startsWith(`${resolvedDirectory}${sep}`)) {
    throw new Error('UPLOAD_STORAGE_PATH_OUTSIDE_ROOT');
  }
  return target;
}

export function contentDispositionAttachment(filename: string): string {
  const safe = replaceControlOrBidi(filename.normalize('NFC'));
  const fallback = truncateUtf8(
    safe.replace(/[^A-Za-z0-9._-]+/g, '_'),
    120,
  );
  return `attachment; filename="${fallback || 'download'}"; filename*=UTF-8''${encodeURIComponent(
    safe,
  )}`;
}

function recoverReversibleMojibake(
  value: string,
  expectedExtension: string,
): { value: string; recovered: boolean; ambiguous: boolean } {
  if (
    value.length === 0 ||
    value.includes('\uFFFD') ||
    !MOJIBAKE_EVIDENCE.test(value) ||
    [...value].some((character) => character.codePointAt(0)! > 0xff)
  ) {
    return { value, recovered: false, ambiguous: false };
  }

  try {
    const bytes = Buffer.from(value, 'latin1');
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const roundTrip = Buffer.from(decoded, 'utf8').toString('latin1');
    const normalizedDecoded = decoded.normalize('NFC');
    const expected = expectedExtension.toLocaleLowerCase('en-US');
    const extensionMatches =
      extname(normalizedDecoded).toLocaleLowerCase('en-US') === expected;
    if (
      roundTrip !== value ||
      decoded === value ||
      !extensionMatches ||
      MOJIBAKE_EVIDENCE.test(decoded)
    ) {
      return { value, recovered: false, ambiguous: true };
    }
    return { value: decoded, recovered: true, ambiguous: false };
  } catch {
    return { value, recovered: false, ambiguous: true };
  }
}

function reviewFilename(
  raw: string,
  canonical: string,
  ambiguous: boolean,
): FilenameReviewCode | null {
  if (canonical.trim().length === 0) return FILENAME_REVIEW_CODES.empty;
  if (raw.includes('\uFFFD')) return FILENAME_REVIEW_CODES.invalidUtf8;
  if (ambiguous) return FILENAME_REVIEW_CODES.ambiguousEncoding;
  if ([...canonical].some(isControlOrBidi)) {
    return FILENAME_REVIEW_CODES.unsafeCharacters;
  }
  if (Buffer.byteLength(canonical, 'utf8') > UPLOAD_FILENAME_MAX_DISPLAY_BYTES) {
    return FILENAME_REVIEW_CODES.tooLong;
  }
  return null;
}

function storageSafeBasename(
  canonical: string,
  expectedExtension: string,
  fileSha256: string,
): string {
  let safe = canonical
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[. ]+$/g, '')
    .replace(/^[. ]+/g, '');
  safe = replaceControlOrBidi(safe);
  if (WINDOWS_RESERVED.test(safe)) safe = `_${safe}`;
  safe = truncatePreservingExtension(
    safe,
    expectedExtension,
    UPLOAD_FILENAME_MAX_STORAGE_BYTES,
  );
  if (!safe || safe === expectedExtension) {
    const digest = /^[a-f0-9]{12,}$/iu.test(fileSha256)
      ? fileSha256.slice(0, 12).toLowerCase()
      : 'internal';
    return `upload-${digest}${expectedExtension}`;
  }
  return safe;
}

function replaceControlOrBidi(value: string): string {
  return [...value]
    .map((character) => (isControlOrBidi(character) ? '_' : character))
    .join('');
}

function isControlOrBidi(character: string): boolean {
  const point = character.codePointAt(0)!;
  return (
    point <= 0x1f ||
    (point >= 0x7f && point <= 0x9f) ||
    point === 0x061c ||
    point === 0x200e ||
    point === 0x200f ||
    (point >= 0x202a && point <= 0x202e) ||
    (point >= 0x2066 && point <= 0x2069)
  );
}

function truncatePreservingExtension(
  value: string,
  expectedExtension: string,
  maxBytes: number,
): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  const actualExtension = extname(value);
  const extension =
    actualExtension.toLocaleLowerCase('en-US') ===
    expectedExtension.toLocaleLowerCase('en-US')
      ? actualExtension
      : expectedExtension;
  const stem = actualExtension ? value.slice(0, -actualExtension.length) : value;
  const stemLimit = Math.max(1, maxBytes - Buffer.byteLength(extension, 'utf8'));
  return `${truncateUtf8(stem, stemLimit)}${extension}`;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}
