import { toHTML } from '@portabletext/to-html';

/** Rich text from Sanity as HTML. Links are escaped and checked by the renderer. */
export const richTextToHtml = (blocks) => (blocks?.length ? toHTML(blocks) : '');

const CATEGORY_LABELS = {
  trailer: 'Trailer',
  'sound-design': 'Sound design',
  music: 'Music',
  mix: 'Mix',
  games: 'Games',
  advertisement: 'Advertisement',
};

export const formatCategories = (categories) =>
  categories.map((value) => CATEGORY_LABELS[value] ?? value).join(', ');
