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
