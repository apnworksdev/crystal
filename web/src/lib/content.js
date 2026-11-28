import { createClient } from '@sanity/client';
import { createImageUrlBuilder } from '@sanity/image-url';
import { getSecret, SANITY_DATASET, SANITY_PROJECT_ID, SANITY_STUDIO_URL, SITE_MODE } from 'astro:env/server';
import * as placeholders from './placeholders.js';
import { projectHasPage } from './pages.js';
import { toVideo } from './video.js';

export const isPreview = SITE_MODE === 'preview';

// Fields that Presentation's click-to-edit may tag with invisible characters.
// Anything used in a URL, an attribute or a comparison must stay out of this list.
// "text" covers the words inside rich text.
const EDITABLE_FIELDS = new Set([
  'title',
  'displayTitle',
  'brand',
  'ceremony',
  'category',
  'work',
  'price',
  'name',
  'position',
  'description',
  'favouriteTrack',
  'text',
  'time',
]);

function createSanityClient() {
  if (!SANITY_PROJECT_ID) return null;

  const client = createClient({
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    apiVersion: '2025-02-19',
    // Rebuilds and previews must always see the newest content.
    useCdn: false,
  });

  if (!isPreview) return client;

  return client.withConfig({
    token: getSecret('SANITY_READ_TOKEN'),
    perspective: 'drafts',
    resultSourceMap: 'withKeyArraySelector',
    stega: {
      enabled: true,
      studioUrl: SANITY_STUDIO_URL,
      filter: ({ sourcePath }) => EDITABLE_FIELDS.has(sourcePath.at(-1)),
    },
  });
}

// Without a project ID the site runs on placeholder content. Once one is set,
// any Sanity error fails the build, so placeholders can never replace a live site.
const client = createSanityClient();
const builder = client ? createImageUrlBuilder(client) : null;

const IMAGE = `{ alt, crop, hotspot, asset->{ _id, metadata { lqip, dimensions } } }`;
const MEDIA = `{ kind, image ${IMAGE}, poster ${IMAGE}, videoUrl, "videoFileUrl": videoFile.asset->url }`;

const QUERIES = {
  settings: `*[_type == "siteSettings"][0] {
    title, description, email, links[] { label, url },
    news { enabled, items[] { _key, title, link, images[] ${IMAGE}, image ${IMAGE} } }
  }`,
  projects: `*[_type == "project" && defined(slug.current)] | order(year desc, title asc) {
    _id, title, displayTitle, "slug": slug.current, brand, year, time, categories, description, credits,
    showInWork, showInArchive, mainMedia ${MEDIA}, thumbnail ${MEDIA}
  }`,
  homeProjectIds: `*[_type == "homePage"][0].projects[]._ref`,
  awards: `*[_type == "award"] | order(year desc, _createdAt asc) {
    _id, ceremony, category, work, year, image ${IMAGE}
  }`,
  products: `*[_type == "product" && defined(slug.current)] | order(_createdAt desc) {
    _id, title, "slug": slug.current, price, url, size, images[] ${IMAGE}
  }`,
  about: `*[_type == "aboutPage"][0] {
    content,
    team[] { _key, name, position, description, favouriteTrack, image ${IMAGE} }
  }`,
};

const IMAGE_WIDTHS = [480, 800, 1200, 1600, 2000, 2600];

/** Turns a Sanity image into the props Media.astro uses. */
function toImage(source, aspect) {
  if (!source?.asset?.metadata) return null;

  const { dimensions, lqip } = source.asset.metadata;
  const cropWidth = 1 - (source.crop?.left ?? 0) - (source.crop?.right ?? 0);
  const cropHeight = 1 - (source.crop?.top ?? 0) - (source.crop?.bottom ?? 0);
  const maxWidth = Math.round(dimensions.width * cropWidth);
  const ratio = aspect ?? maxWidth / (dimensions.height * cropHeight);

  const urlFor = (width) => {
    const image = builder.image(source).width(width).auto('format').quality(80);
    return aspect ? image.height(Math.round(width / aspect)).fit('crop').url() : image.url();
  };

  // Never ask the CDN to upscale past the original.
  const widths = IMAGE_WIDTHS.filter((width) => width < maxWidth).concat(
    Math.min(maxWidth, IMAGE_WIDTHS.at(-1)),
  );
  const largest = widths.at(-1);

  return {
    kind: 'image',
    src: urlFor(Math.min(largest, 1600)),
    srcset: widths.map((width) => `${urlFor(width)} ${width}w`).join(', '),
    width: largest,
    height: Math.round(largest / ratio),
    alt: source.alt ?? '',
    lqip,
  };
}

/** Turns a Sanity media field into an image or a video. */
async function toMedia(source, aspect) {
  if (source?.kind === 'image') return toImage(source.image, aspect);
  // An uploaded file comes first; otherwise the link (Vimeo, or a direct MP4).
  return toVideo(source?.videoFileUrl || source?.videoUrl, toImage(source?.poster, aspect));
}

const toProject = async (project) => ({
  ...project,
  displayTitle: project.displayTitle || project.title,
  categories: project.categories ?? [],
  description: project.description ?? [],
  credits: project.credits ?? [],
  thumbnail: await toMedia(project.thumbnail?.kind ? project.thumbnail : project.mainMedia),
  mainMedia: await toMedia(project.mainMedia),
});

const stripEmpty = (object) =>
  Object.fromEntries(Object.entries(object ?? {}).filter(([, value]) => value != null));

const TRANSFORMS = {
  settings: (settings) => {
    const { news, ...rest } = stripEmpty(settings);
    const items = news?.enabled
      ? (news.items ?? [])
          .map((item) => {
            // images[] is current; a lone `image` is kept so older published items still show.
            const images = (item.images?.length ? item.images : item.image ? [item.image] : [])
              .map((image) => toImage(image))
              .filter(Boolean);
            return { _key: item._key, title: item.title, link: item.link, images };
          })
          .filter((item) => item.title && item.images.length)
      : [];
    return {
      ...placeholders.settings,
      ...rest,
      news: items.length ? items : null,
      isPlaceholder: false,
    };
  },
  projects: (projects) => Promise.all(projects.map(toProject)),
  homeProjectIds: (ids) => ids ?? [],
  awards: (awards) => awards.map((award) => ({ ...award, image: toImage(award.image) })),
  products: (products) =>
    products.map((product) => ({
      ...product,
      // 1 is a cap. Missing or nonsense values fall back to it.
      size: Number.isFinite(product.size) && product.size > 0 ? product.size : 1,
      images: (product.images ?? []).map((image) => toImage(image)).filter(Boolean),
    })),
  about: (about) => {
    const content = about?.content ?? [];
    const team = (about?.team ?? []).map((member) => ({ ...member, image: toImage(member.image, 4 / 5) }));
    // An empty Studio document still has to show the panel while the copy is being written.
    if (!content.length && !team.length) return placeholders.about;
    return { content, team };
  },
};

// A static build makes one request per query, however many pages ask.
// Preview fetches every time, or editors would see stale drafts.
const cache = new Map();

function load(name) {
  if (!client) return Promise.resolve(placeholders[name]);
  const request = () => client.fetch(QUERIES[name]).then(TRANSFORMS[name]);
  if (isPreview) return request();
  if (!cache.has(name)) cache.set(name, request());
  return cache.get(name);
}

export const getSettings = () => load('settings');
export const getProjects = () => load('projects');
export const getAwards = () => load('awards');
export const getProducts = () => load('products');
export const getAbout = () => load('about');

/** One product by its page address. */
export const getProduct = async (slug) => (await getProducts()).find((product) => product.slug === slug);

export const getWorkProjects = async () => (await getProjects()).filter((project) => project.showInWork);
export const getArchiveProjects = async () => (await getProjects()).filter((project) => project.showInArchive);

/** Projects with a page: listed on the home page or the work page. */
export const getPageProjects = async () => {
  const [projects, ids] = await Promise.all([getProjects(), load('homeProjectIds')]);
  return projects.filter((project) => projectHasPage(project, ids));
};

/** Projects picked for the home page, in the editor's order. */
export async function getHomeProjects() {
  const [projects, ids] = await Promise.all([getProjects(), load('homeProjectIds')]);
  const byId = new Map(projects.map((project) => [project._id, project]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
