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

const award = (id, year, ceremony, category, work, picture) => ({
  _id: id,
  ceremony,
  category,
  work,
  year,
  image: image(picture),
});

const awardPictures = ['ember', 'moss', 'north-light'];

// Sample lines. The first eleven follow the awards-page layout comp; the rest continue in that voice.
const awardRows = [
  [2026, 'Academy Awards', 'Best Original Score', "Spider-Man - Brand New Day, What it's all about"],
  [2026, 'BAFTA Film Awards', 'Original Score', 'Silo S3'],
  [2026, 'Golden Globes', 'Best Original Score', 'Hot & Exclusive'],
  [2026, 'Golden Globes', 'Best Original Song', 'Hard Knocks: Training Camp With the Buffalo Bills (Official Trailer)'],
  [2026, 'Primetime Emmy Awards', 'Outstanding Music Composition for a Series', 'Hard Knocks: Training Camp With the Buffalo Bills (Official Trailer)'],
  [2025, 'Primetime Emmy Awards', 'Outstanding Music Composition for a Limited Series, Movie or Special', 'Murdaugh: Death in the Family'],
  [2025, 'Academy Awards', 'Best Original Score', "Spider-Man - Brand New Day, What it's all about"],
  [2025, 'BAFTA Film Awards', 'Original Score', 'Silo S3'],
  [2025, 'Golden Globes', 'Best Original Score', 'Hot & Exclusive'],
  [2025, 'Golden Globes', 'Best Original Song', 'Hard Knocks: Training Camp With the Buffalo Bills (Official Trailer)'],
  [2025, 'Primetime Emmy Awards', 'Outstanding Music Composition for a Series', 'Hard Knocks: Training Camp With the Buffalo Bills (Official Trailer)'],
  [2024, 'Academy Awards', 'Best Sound', 'The Long Return'],
  [2024, 'BAFTA Film Awards', 'Original Score', 'Glass Harbour'],
  [2024, 'Golden Globes', 'Best Original Song', 'Night Market'],
  [2024, 'Primetime Emmy Awards', 'Outstanding Music Composition for a Documentary Series', 'Paper Crown'],
  [2024, 'Grammy Awards', 'Best Score Soundtrack for Visual Media', 'Field Recording'],
  [2023, 'Society of Composers and Lyricists', 'Outstanding Original Score', 'Red Lantern'],
  [2023, 'Annie Awards', 'Outstanding Achievement in Music', 'Paper Boat'],
  [2023, 'World Soundtrack Awards', 'Discovery of the Year', 'Low Tide'],
  [2023, 'Hollywood Music in Media Awards', 'Best Main Title', 'North Window'],
];

export const awards = awardRows.map(([year, ceremony, category, work], index) =>
  award(`a${index + 1}`, year, ceremony, category, work, awardPictures[index % awardPictures.length]),
);

const productImage = (name, alt, width, height) => ({
  ...image(name, alt),
  width,
  height,
});

export const products = [
  {
    _id: 'p1',
    title: 'Sample Tote',
    slug: 'sample-tote',
    price: '€25',
    url: 'https://example.com',
    images: [
      productImage('north-light', 'Sample Tote', 900, 1100),
      productImage('ember', 'Sample Tote, reverse', 900, 1100),
      productImage('moss', 'Sample Tote, detail', 1100, 900),
    ],
  },
  {
    _id: 'p2',
    title: 'Sample Cap',
    slug: 'sample-cap',
    price: '$15',
    url: 'https://example.com',
    images: [productImage('ember', 'Sample Cap', 1000, 800), productImage('north-light', 'Sample Cap, side', 1000, 800)],
  },
  {
    _id: 'p3',
    title: 'Sample Sweatshirt',
    slug: 'sample-sweatshirt',
    price: '€55',
    url: 'https://example.com',
    images: [productImage('moss', 'Sample Sweatshirt', 1200, 1000)],
  },
  {
    _id: 'p4',
    title: 'Sample Vinyl',
    slug: 'sample-vinyl',
    price: '€28',
    url: 'https://example.com',
    images: [productImage('north-light', 'Sample Vinyl', 1000, 1000)],
  },
];

const portraits = [
  ['airpods', 843, 946],
  ['braid', 1024, 1257],
  ['headphones', 1024, 1153],
  ['face', 842, 945],
];

const portrait = (index) => {
  const [name, width, height] = portraits[index % portraits.length];
  return { kind: 'image', src: `/team/${name}.webp`, width, height, alt: '' };
};

// Fifteen people, so the about panel can be checked once the portraits overflow.
const teamRows = [
  [
    'Joanna Starling',
    'Music Supervisor and Brand Producer',
    'Joanna is a music supervisor and brand producer with experience across music, advertising and brand campaigns. She has worked with brands including Nike, Adidas, Amazon, Google and Netflix.',
    'Frontier Psychiatrist — The Avalanches',
  ],
  ['Miles Okonkwo', 'Composer'],
  ['Lena Voss', 'Sound Designer'],
  ['Arthur Pell', 'Mix Engineer'],
  ['Sofia Marchetti', 'Producer'],
  ['Jonah Reed', 'Music Editor'],
  ['Hanae Ito', 'Composer'],
  ['Chris Adelayo', 'Sound Designer'],
  ['Priya Raman', 'Music Supervisor'],
  ['Elliot Marsh', 'Re-recording Mixer'],
  ['Noor El-Sayed', 'Producer'],
  ['Mateo Ruiz', 'Composer'],
  ['Freya Lind', 'Music Editor'],
  ['Samir Shah', 'Sound Designer'],
  ['Ingrid Solberg', 'Brand Producer'],
];

export const about = {
  content: [
    paragraph('The Crystal Creative is built on trusted artist and client relationships.'),
    paragraph('We believe this is the foundation of lasting partnerships and yields the highest possible creative output.'),
  ],
  team: teamRows.map(([name, position, description = '', favouriteTrack = ''], index) => ({
    _key: `t${index + 1}`,
    name,
    position,
    description,
    favouriteTrack,
    image: portrait(index),
  })),
};

export const settings = {
  title: 'Crystal',
  description: 'Music, sound design and mixing for film, games and advertising.',
  email: 'hello@example.com',
  links: [
    { label: 'Spotify', url: 'https://open.spotify.com' },
    { label: 'Instagram', url: 'https://instagram.com' },
    { label: 'Youtube', url: 'https://youtube.com' },
  ],
  news: [
    { _key: 'emmys', title: 'Crystal featured at the Emmy Awards 26', image: image('ember'), link: null },
    { _key: 'sxsw', title: 'Live at SXSW', image: image('moss'), link: null },
  ],
  isPlaceholder: true,
};
