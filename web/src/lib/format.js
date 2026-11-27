import { toHTML } from '@portabletext/to-html';

/** Rich text from Sanity as HTML. Links are escaped and checked by the renderer. */
export const richTextToHtml = (blocks) => (blocks?.length ? toHTML(blocks) : '');

export const CATEGORIES = [
  { value: 'trailer', label: 'Trailer' },
  { value: 'sound-design', label: 'Sound design' },
  { value: 'music', label: 'Music' },
  { value: 'mix', label: 'Mix' },
  { value: 'games', label: 'Games' },
  { value: 'advertisement', label: 'Advertisement' },
];

/** A price as written in the Studio. A bare number gets a dollar sign: "15" reads "$15". */
export function formatPrice(value) {
  const text = String(value ?? '').trim();
  return /^\d/.test(text) ? `$${text}` : text;
}

/**
 * Credits are written one per line in the Studio, as "Role: Name". Each becomes a row of two
 * columns, split at the first colon. A line without one is a name with no role.
 */
export function creditRows(blocks) {
  return (blocks ?? [])
    .map((block) => (block?.children ?? []).map((child) => child?.text ?? '').join(''))
    .map((text) => {
      const at = text.indexOf(':');
      return at > 0
        ? { label: text.slice(0, at).trim(), value: text.slice(at + 1).trim() }
        : { label: '', value: text.trim() };
    })
    .filter((row) => row.label || row.value);
}
