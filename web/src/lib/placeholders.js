// Sample content, used only while SANITY_PROJECT_ID is empty.

const image = (name, alt = '') => ({
  kind: 'image',
  src: `/placeholders/${name}.svg`,
  width: 1600,
  height: 1200,
  alt,
});

const paragraph = (text) => ({
  _type: 'block',
  _key: text.slice(0, 8),
  style: 'normal',
  markDefs: [],
  children: [{ _type: 'span', _key: 's', text, marks: [] }],
});

const project = (id, title, brand, year, categories, picture, pages, time) => ({
  _id: id,
  title,
  slug: id,
  brand,
  year,
  time,
  categories,
  description: [paragraph('Placeholder description. Connect Sanity and publish a project to replace it.')],
  credits: [
    paragraph('Director: Director Name'),
    paragraph('Starring: Actor Name, Actor Name'),
    paragraph('Screenplay: Writer Name'),
    paragraph('Edited by: Editor Name'),
  ],
  showInWork: pages.includes('work'),
  showInArchive: pages.includes('archive'),
  thumbnail: image(picture, title),
  mainMedia: image(picture, title),
});

export const projects = [
  project('north-light', 'North Light', 'Sample Studio', 2026, ['trailer', 'music'], 'north-light', ['work'], '00:01:12:00'),
  project('ember', 'Ember', 'Sample Brand', 2025, ['sound-design', 'mix'], 'ember', ['work', 'archive'], '00:02:04:00'),
  project('moss', 'Moss', 'Sample Games', 2024, ['games', 'music'], 'moss', ['archive']),
  project('static', 'Static', 'Sample Agency', 2023, ['advertisement'], 'north-light', ['archive']),
];

export const homeProjectIds = ['north-light', 'ember', 'moss'];

export const awards = [
  {
    _id: 'a1',
    ceremony: 'Sample Awards',
    category: 'Best Original Score',
    work: 'Sample Project, Sample Track',
    year: 2026,
    image: image('ember'),
  },
  {
    _id: 'a2',
    ceremony: 'Sample Festival',
    category: 'Best Sound Design',
    work: 'Another Project',
    year: 2025,
    image: image('moss'),
  },
];

export const products = [
  {
    _id: 'p1',
    title: 'Sample T-shirt',
    price: '€35',
    url: 'https://example.com',
    images: [image('north-light', 'Sample T-shirt'), image('ember', 'Sample T-shirt, back')],
  },
  { _id: 'p2', title: 'Sample Vinyl', price: '€28', url: 'https://example.com', images: [image('moss', 'Sample Vinyl')] },
];

export const about = {
  content: [paragraph('Placeholder about text. Add your own in the Studio under About page.')],
  team: [
    {
      _key: 't1',
      name: 'Team Member',
      position: 'Composer',
      description: 'Placeholder description of this person.',
      favouriteTrack: 'Frontier Psychiatrist — The Avalanches',
      image: image('ember'),
    },
    {
      _key: 't2',
      name: 'Team Member',
      position: 'Sound designer',
      description: 'Placeholder description of this person.',
      favouriteTrack: 'Song Title — Artist',
      image: image('moss'),
    },
  ],
};

export const settings = {
  title: 'Crystal',
  description: 'Music, sound design and mixing for film, games and advertising.',
  email: 'hello@example.com',
  links: [],
  popup: null,
  isPlaceholder: true,
};
