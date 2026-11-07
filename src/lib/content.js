import { createClient } from '@sanity/client';
import { createImageUrlBuilder } from '@sanity/image-url';
import { SANITY_DATASET, SANITY_PROJECT_ID, SANITY_STUDIO_URL, SITE_MODE } from 'astro:env/server';
import { getSecret } from 'astro:env/server';
import { placeholderProjects, placeholderSettings } from './placeholders.js';

export const isPreview = SITE_MODE === 'preview';

// Fields that Presentation's click-to-edit may tag with invisible characters.
// Anything used in a URL, an attribute or a comparison must stay out of this list.
const EDITABLE_FIELDS = new Set(['title', 'tagline', 'bio', 'role', 'summary', 'description']);

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

const IMAGE_WIDTHS = [480, 800, 1200, 1600, 2000, 2600];

const IMAGE_FIELDS = `{
  alt,
  crop,
  hotspot,
  asset->{ _id, metadata { lqip, dimensions } }
}`;

const PROJECT_QUERY = `*[_type == "project" && defined(slug.current)]
  | order(year desc, _createdAt desc) {
    title,
    "slug": slug.current,
    year,
    role,
    summary,
    description,
    cover ${IMAGE_FIELDS},
    gallery[] ${IMAGE_FIELDS}
  }`;

const SETTINGS_QUERY = `*[_type == "siteSettings"][0] {
  title, tagline, description, bio, email, links[] { label, url }
}`;

/** Turns a Sanity image into the props used by Media.astro. */
function toImage(source, aspect) {
  if (!source?.asset) return null;

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
    src: urlFor(Math.min(largest, 1600)),
    srcset: widths.map((width) => `${urlFor(width)} ${width}w`).join(', '),
    width: largest,
    height: Math.round(largest / ratio),
    alt: source.alt ?? '',
    lqip,
  };
}

function toProject(project) {
  return {
    ...project,
    card: toImage(project.cover, 4 / 3),
    hero: toImage(project.cover),
    gallery: (project.gallery ?? []).map((image) => toImage(image)).filter(Boolean),
  };
}

function fetchProjects() {
  return client.fetch(PROJECT_QUERY).then((projects) => projects.map(toProject));
}

function fetchSettings() {
  return client.fetch(SETTINGS_QUERY).then((settings) => ({
    ...placeholderSettings,
    ...stripEmpty(settings),
    isPlaceholder: false,
  }));
}

function stripEmpty(object) {
  return Object.fromEntries(Object.entries(object ?? {}).filter(([, value]) => value != null));
}

// A static build makes one request, however many pages ask.
// Preview fetches every time, or editors would see stale drafts.
function once(fetcher) {
  let request;
  return () => (request ??= fetcher());
}

const cachedProjects = once(fetchProjects);
const cachedSettings = once(fetchSettings);

export function getProjects() {
  if (!client) return Promise.resolve(placeholderProjects);
  return isPreview ? fetchProjects() : cachedProjects();
}

export function getSettings() {
  if (!client) return Promise.resolve(placeholderSettings);
  return isPreview ? fetchSettings() : cachedSettings();
}
