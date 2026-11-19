import { map } from 'rxjs';

const STATIC = {
  award: { locations: [{ title: 'Awards', href: '/awards' }] },
  homePage: { locations: [{ title: 'Home', href: '/' }] },
  aboutPage: {
    message: 'Opens from the About button',
    locations: [{ title: 'Home', href: '/' }],
  },
  siteSettings: {
    message: 'Used on every page',
    tone: 'positive',
    locations: [{ title: 'Home', href: '/' }],
  },
};

/** Where a project can be opened. No page means the archive, when it is listed there. */
export function projectLocations(doc) {
  if (!doc) return [];
  const hasPage = Boolean(doc.showInWork || doc.onHome);
  const locations = [];
  if (hasPage && doc.slug) locations.push({ title: doc.title || 'Project page', href: `/projects/${doc.slug}` });
  if (doc.showInWork) locations.push({ title: 'Work', href: '/work' });
  if (doc.showInArchive) locations.push({ title: 'Archive', href: '/archive' });
  return locations;
}

/** Merch always, and the product page when the product has a slug. */
export function productLocations(doc) {
  if (!doc) return [];
  const locations = [{ title: 'Merch', href: '/merch' }];
  if (doc.slug) locations.push({ title: doc.title || 'Product page', href: `/merch/${doc.slug}` });
  return locations;
}

const PROJECT_QUERY = `*[_id == $id][0]{
  title,
  "slug": slug.current,
  showInWork,
  showInArchive,
  "onHome": count(*[_type == "homePage" && references($published)]) > 0
}`;

const PRODUCT_QUERY = `*[_id == $id][0]{
  title,
  "slug": slug.current
}`;

export function resolveLocations({ id, type, perspectiveStack }, context) {
  const known = STATIC[type];
  if (known) return known;
  if (!context?.documentStore?.listenQuery) return { locations: [] };

  const published = String(id).replace(/^drafts\./, '');

  if (type === 'product') {
    return context.documentStore
      .listenQuery(
        { fetch: PRODUCT_QUERY, listen: '*[_id == $id]' },
        { id, published },
        { perspective: perspectiveStack, tag: 'product-locations' },
      )
      .pipe(map((doc) => ({ locations: productLocations(doc) })));
  }

  if (type !== 'project') return { locations: [] };

  return context.documentStore
    .listenQuery(
      { fetch: PROJECT_QUERY, listen: '*[_type == "homePage" || _id == $id]' },
      { id, published },
      { perspective: perspectiveStack, tag: 'project-locations' },
    )
    .pipe(map((doc) => ({ locations: projectLocations(doc) })));
}
