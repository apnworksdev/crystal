import { award } from './award.js';
import { media, richText } from './fields.js';
import { aboutPage, homePage, siteSettings } from './pages.js';
import { product } from './product.js';
import { project } from './project.js';

export const schemaTypes = [project, award, product, homePage, aboutPage, siteSettings, media, richText];

/** Types with exactly one document, edited from a fixed place in the Studio. */
export const SINGLETONS = ['homePage', 'aboutPage', 'siteSettings'];

/** Types whose published changes go live with "Put changes live". */
export const CONTENT_TYPES = ['project', 'award', 'product', ...SINGLETONS];
