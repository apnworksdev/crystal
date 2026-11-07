// Sample content, used only while SANITY_PROJECT_ID is not set.

const image = (name, alt) => ({
  src: `/placeholders/${name}.svg`,
  width: 1600,
  height: 1200,
  alt,
});

const project = ({ slug, title, year, role, summary, alt, gallery }) => ({
  slug,
  title,
  year,
  role,
  summary,
  description:
    'This is placeholder text. Connect Sanity and publish a project to replace it.\n\nUse this space to describe the brief, your approach and the outcome.',
  card: image(slug, alt),
  hero: image(slug, alt),
  gallery: gallery.map((name) => image(name, 'Placeholder gallery image')),
});

export const placeholderProjects = [
  project({
    slug: 'north-light',
    title: 'North Light',
    year: 2026,
    role: 'Art direction, Web design',
    summary: 'Sample project: a cool, quiet identity for an imaginary photography studio.',
    alt: 'Abstract blue crystal facets',
    gallery: ['ember', 'moss'],
  }),
  project({
    slug: 'ember',
    title: 'Ember',
    year: 2025,
    role: 'Brand identity',
    summary: 'Sample project: a warm visual system for an imaginary ceramics workshop.',
    alt: 'Abstract orange crystal facets',
    gallery: ['moss', 'north-light'],
  }),
  project({
    slug: 'moss',
    title: 'Moss',
    year: 2024,
    role: 'Web design, Development',
    summary: 'Sample project: a calm, fast website for an imaginary garden studio.',
    alt: 'Abstract green crystal facets',
    gallery: ['north-light', 'ember'],
  }),
];

export const placeholderSettings = {
  title: 'Crystal',
  tagline: 'Placeholder statement about the work you do and who you do it for.',
  description: 'A portfolio built with Astro and Sanity.',
  bio: 'This is placeholder about text.\n\nAdd your own in Sanity under Site settings.',
  email: 'hello@example.com',
  links: [],
  isPlaceholder: true,
};
