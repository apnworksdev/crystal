# Crystal: notes for agents

Portfolio site for a music and sound studio. An Astro site, written in plain JavaScript, with a Sanity Studio
and hosting on Netlify. Read this before changing structure, names or styles.

[README.md](README.md) explains how to run things. [SETUP.md](SETUP.md) covers environments and deploys.

## Ground rules

- **Plain JavaScript only.** No TypeScript, no `.ts` files, no type generation.
- **The site owner writes the CSS.** Don't add or restyle visual CSS unless asked. Behaviour-only CSS, such as
  view transitions, is fine, but say so when you add it.
- **Keep the public site fast.** It's static, ships about 16 KB of JavaScript, and loads nothing from preview mode.
  Check the size of `web/dist/_astro` after adding anything that runs in the browser.
- **The user handles Git.** Don't commit or push unless asked.

## Repository layout

```
crystal-web/
├── web/          Astro site. Netlify builds this folder ("web" is the base directory)
├── studio/       Sanity Studio. Deployed to *.sanity.studio
├── package.json  shortcuts only (dev:edit, dev:all, setup). No workspaces
├── AGENTS.md     this file
├── README.md
└── SETUP.md
```

`web/` and `studio/` are separate npm packages with their own dependencies and `.env` files. Don't merge them
into workspaces, because Netlify would then install the Studio's dependencies on every site build.

## `web/src`

```
components/   reusable pieces (Media, ProjectGrid, Popup)
layouts/      page shell (Base.astro): head, header, footer, popup, global styles
lib/          data and helpers, no browser code
  content.js      every Sanity query and the shape of the data pages receive
  placeholders.js sample content, used when SANITY_PROJECT_ID is empty
  video.js        turns Vimeo or MP4 links into embed data
  format.js       rich text to HTML, category labels
pages/        one file per route
preview/      code that only exists in preview mode (draft-mode route, session check, click-to-edit)
scripts/      browser code (page.js: video autoplay, popup, click-to-load Vimeo player)
styles/       see below
```

- **Data:** pages get data only from functions in `lib/content.js`. Don't query Sanity from a page.
- **New fields:** add them to the query and transform in `content.js`, to `placeholders.js`, and to the
  Studio schema.
- **Browser code:** goes in `scripts/` and must work after an Astro page transition. Run setup on load and on
  `astro:after-swap`, as `page.js` does. Event delegation on `document` only needs registering once.

## Styles

```
web/src/styles/
├── common/
│   ├── variables.css     custom properties: colours, font, spacing, timing
│   ├── fonts.css         @font-face rules. Font files go in web/public/fonts/
│   ├── globals.css       shared reset and utilities, reused across projects. Don't edit
│   ├── main.css          body and main layout for this project
│   └── transitions.css   view transition rules
├── components/           one file per component: ProjectGrid.astro → project-grid.css
└── pages/                one file per page: awards.astro → awards.css
```

- **Common files:** imported once, in `layouts/Base.astro`, in the order variables, fonts, globals, main,
  transitions.
- **Component and page files:** imported by the component or page that uses them, at the top of its frontmatter:
  `import '../styles/pages/awards.css';`. Astro then only loads them on pages that need them.
- **Never** create an index file that imports every stylesheet. It would send all the CSS to every page.
- **`globals.css` is shared across projects.** Put project-specific base styles in `main.css` instead.
- **Utility classes come from `globals.css`:** `.sr-only` (visually hidden, still read by screen readers) and
  `.hidden`.

## Naming

| What | Convention | Example |
|---|---|---|
| Astro components and layouts | PascalCase | `ProjectGrid.astro` |
| Pages | Lowercase, matching the URL | `awards.astro`, `projects/[slug].astro` |
| CSS, scripts, lib files | kebab-case | `project-grid.css`, `video.js` |
| Component CSS file | Component name in kebab-case | `ProjectGrid.astro` → `project-grid.css` |
| CSS classes | BEM | `.block`, `.block__element`, `.block--modifier` |
| CSS custom properties | kebab-case, descriptive | `--foreground-color`, `--transition-duration` |
| Sanity types and fields | camelCase | `homePage`, `mainMedia`, `showInWork` |

### BEM blocks in use

| Block | Where | Elements |
|---|---|---|
| `site-header` | Base layout | `__logo`, `__nav`, `__link` |
| `site-footer` | Base layout | `__link` |
| `media` | Media.astro (no wrapper element) | `__image`, `__poster`, `__video`, `__play`, `__loop`, `__player` |
| `popup` | Popup.astro | `__header`, `__close`, `__body`, `__image`, `__title` |
| `project-grid` | ProjectGrid.astro | `__item` |
| `project-card` | ProjectGrid.astro | `__media`, `__info`, `__title`, `__meta` |
| `project` | projects/[slug] | `__header`, `__title`, `__meta`, `__media`, `__body`, `__description`, `__credits`, `__credit`, `__credit-label`, `__credit-value` |
| `archive` | archive | `__item`, `__link`, `__title`, `__brand`, `__categories`, `__year` |
| `awards`, `award` | awards | `award__text`, `__ceremony`, `__category`, `__work`, `__image`, `__year` |
| `product-list`, `product` | merch | `product__images`, `__info`, `__title`, `__price`, `__buy` |
| `about`, `team`, `team-member` | about | `about__text`, `team__title`, `team__list`, `team-member__image`, `__name`, `__position`, `__description`, `__track`, `__track-label` |
| `page-title`, `empty-message`, `rich-text` | Shared | none |

- **`.media__*` elements** sit directly inside whatever wraps them, such as `.project-card__media` or `.award__image`.
  Size and crop media through the wrapper.
- **`.project__media`** gets `data-kind="video"` or `data-kind="image"` from the main media's type, for styling.
- **JavaScript hooks** use data attributes, not classes: `data-autoplay`, `data-popup-key`,
  `data-vimeo-player`. Renaming a class must never break a script.
- **Renaming:** when you rename a class, search `components`, `layouts`, `pages`, `scripts` and `styles`.

## Content model (Sanity)

| Type | Kind | Notes |
|---|---|---|
| `project` | Documents | `showInWork` and `showInArchive` switches. A project can be on both, one or neither |
| `homePage` | Single document | Ordered references to projects |
| `award` | Documents | `ceremony`, `category`, `work`, `year`, `image` |
| `product` | Documents | `title`, `price` (a string with currency), `url`, `images` |
| `aboutPage` | Single document | `content` (rich text) and a `team` array |
| `siteSettings` | Single document | Site name, SEO description, email, social links, `popup` |
| `media` | Object | `kind` is `video` or `image`. Videos are links (`videoUrl`): Vimeo, or a direct MP4 |
| `richText` | Array | Paragraphs, bold, italic and links only |

Single documents have fixed IDs equal to their type name and are listed in `SINGLETONS` in
`studio/schemaTypes/index.js`. When adding a content type, also add it to `CONTENT_TYPES` there, for the
"Put changes live" count, and to `presentationTool` locations in `studio/sanity.config.js`.

## Environments

| Environment | Mode | Shows |
|---|---|---|
| Production | Static build | Published content. Deploys only from "Put changes live" or a push to `main` |
| Preview | `SITE_MODE=preview`, server-rendered on the `preview` branch | Drafts. Only opens from the Studio |
| Local | `npm run dev:edit` (preview and Studio) or `npm run dev:all` (site and Studio) | |

- **Production deploys cost Netlify credits.** Never add a webhook that deploys on every publish.
- **`SANITY_READ_TOKEN` reads drafts.** It's only allowed in `web/.env` and Netlify's `preview` branch. Never put it
  in `netlify.toml`, a `PUBLIC_` variable or a `SANITY_STUDIO_` variable.

## Gotchas

- **Click-to-edit adds invisible characters** to the fields listed in `EDITABLE_FIELDS` in `lib/content.js`. Never
  add a field there that's used in a URL, an attribute, a `transition:name` or a comparison. Wrap such values in
  `stegaClean()` if in doubt.
- **Preview has no page transitions.** It uses normal page loads because click-to-edit needs a stable page, so test
  transitions with `npm run dev` or `dev:all`.
- **Project pages look up their slug at runtime.** `pages/projects/[slug].astro` uses the slug instead of
  `getStaticPaths` props, because preview mode renders on the server.
- **Sanity UI in the Studio uses `gap`, not `space`.** `space` is silently ignored in this version of `@sanity/ui`.
- **Icons** are imported from their own path: `import { StarIcon } from '@sanity/icons/Star'`. The root export
  no longer has them.
- **Vimeo playback can't be checked in the built-in browser pane.** It fails even on Vimeo's own player page.
  Check video in a real browser.
