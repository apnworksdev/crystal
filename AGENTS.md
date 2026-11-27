# Crystal: notes for agents

Portfolio site for a music and sound studio. An Astro site, written in plain JavaScript, with a Sanity Studio
and hosting on Netlify. Read this before changing structure, names or styles.

[README.md](README.md) explains how to run things. [SETUP.md](SETUP.md) covers environments and deploys.

## Ground rules

- **Plain JavaScript only.** No TypeScript, no `.ts` files, no type generation.
- **The site owner writes the CSS.** Don't add or restyle visual CSS unless asked. Behaviour-only CSS, such as
  view transitions, is fine, but say so when you add it.
- **Keep the public site fast.** It's static, and loads nothing from preview mode. Every page ships about
  22 KB of compressed JavaScript (the shared script plus Astro's router); the home carousel adds about 10 KB on the home page only.
  Check the size of `web/dist/_astro` after adding anything that runs in the browser.
- **The user handles Git.** Don't commit or push unless asked.

## Repository layout

```
crystal-web/
├── web/          Astro site. Netlify builds this folder ("web" is the base directory)
├── studio/       Sanity Studio. Deployed to *.sanity.studio
├── package.json  shortcuts only (dev:edit, dev:all, setup, test). No workspaces
├── AGENTS.md     this file
├── README.md
└── SETUP.md
```

`web/` and `studio/` are separate npm packages with their own dependencies and `.env` files. Don't merge them
into workspaces, because Netlify would then install the Studio's dependencies on every site build.

## `web/src`

```
components/   reusable pieces (Media, ProjectRoulette, ProjectReel, ProjectList, NewsPanel, AboutPanel, FooterLinks:
              the footer's contents, shown in the page footer and, on phone, at the end of About)
layouts/      page shell (Base.astro): head, header (with the news panel), footer, global styles
lib/          data and helpers, no browser code
  content.js      every Sanity query and the shape of the data pages receive
  placeholders.js sample content, used when SANITY_PROJECT_ID is empty
  video.js        turns Vimeo or MP4 links into embed data
  format.js       rich text to HTML, the category list
  pages.js        which projects get a page
  card-stack.js   card positions and easing for the merch stack and pile
  work-stack.js   card positions for the Work stack
  awards-loop.js  wrap maths and centred entry for the endless Awards roll
pages/        one file per route
preview/      code that only exists in preview mode (draft-mode route, session check, click-to-edit)
scripts/      browser code (page.js: video autoplay, click-to-load Vimeo player; news.js: the news panel;
              footer-reveal.js: the footer rising from the bottom of the screen with the desktop menu;
              handoff.js: lets Merch hand its motion to a product page instead of the content fade; box-resize.js: dragging the bottom
              edge of the About, Team and News windows; scroll-end.js: scrollend with a fallback for
              Safari, used by every reel and strip that settles; header-scroll.js: moves the header
              sideways when it runs past the screen)
styles/       see below
```

- **Data:** pages get data only from functions in `lib/content.js`. Don't query Sanity from a page.
- **New fields:** add them to the query and transform in `content.js`, to `placeholders.js`, and to the
  Studio schema.
- **Browser code:** goes in `scripts/` and must work after an Astro page transition. Run setup on load and on
  `astro:after-swap`, as `page.js` does. Event delegation on `document` only needs registering once.
- **Code for one page** (the home carousel, the Work reel, the merch reel, the product strip) is listed in
  `pageModules` in `page.js` and downloaded only when its page is open, then fetched in the background once the
  browser is idle. Add new single-page code there instead of importing it at the top of `page.js`.
- **Tests** sit next to the file they test (`pages.js` → `pages.test.js`) and use Node's built-in runner, with no
  extra packages. Run `npm test` at the root, or in `web/` or `studio/`. Keep logic worth testing in plain
  functions that don't touch the DOM, as `lib/card-stack.js` does.
- **Imports need a matching dependency.** Anything a file imports must be listed in its own `package.json`, even when
  another package already installs it (`vite` in `web/`, `rxjs` in `studio/`).
- **Non-passive `wheel` or `touchmove` listeners** make every scroll wait for JavaScript. Add them only while their
  page is open, as `archive.js` does.

## Styles

```
web/src/styles/
├── common/
│   ├── variables.css     custom properties: colours, font, spacing, timing
│   ├── fonts.css         @font-face rules. Font files go in web/public/fonts/
│   ├── globals.css       shared reset and utilities, reused across projects. Don't edit
│   ├── main.css          body and main layout for this project
│   └── transitions.css   view transition rules
├── components/           one file per component: ProjectReel.astro → project-reel.css. Also header, footer
│                         and intro, which live in Base.astro
└── pages/                one file per page: awards.astro → awards.css
```

- **Common files:** imported once, in `layouts/Base.astro`, in the order variables, fonts, globals, main,
  transitions.
- **Component and page files:** imported by the component or page that uses them, at the top of its frontmatter:
  `import '../styles/pages/awards.css';`. Astro then only loads them on pages that need them.
- **Never** create an index file that imports every stylesheet. It would send all the CSS to every page.
- **`globals.css` is shared across projects.** Put project-specific base styles in `main.css` instead.
- **Phone layout** uses one query, `(max-width: 48rem), (max-height: 30rem) and (pointer: coarse)`, at the end of each
  stylesheet that needs it. `header.js` and `roulette.js` repeat it as `phone`, and `footer.css` and `header.css` negate it for desktop. Change all of them together. Desktop menus open
  sideways in the header row (including Work and Archive); the phone column menu is wrapped in that query in
  `header.css`.
- **Opening motion** (menu, About, Home footer, stacks, page reveal) shares one curve: `--ease-out`,
  `--grow-duration`, `--fade-duration`, `--text-delay` and `--stagger` in `variables.css`. Scripts that animate
  by hand use the same expo-out. Reuse these instead of new timings.
- **Utility classes come from `globals.css`:** `.sr-only` (visually hidden, still read by screen readers) and
  `.hidden`.

## Naming

| What | Convention | Example |
|---|---|---|
| Astro components and layouts | PascalCase | `ProjectReel.astro` |
| Pages | Lowercase, matching the URL | `awards.astro`, `projects/[slug].astro` |
| CSS, scripts, lib files | kebab-case | `project-reel.css`, `video.js` |
| Component CSS file | Component name in kebab-case | `ProjectReel.astro` → `project-reel.css` |
| CSS classes | BEM | `.block`, `.block__element`, `.block--modifier` |
| CSS custom properties | kebab-case, descriptive | `--foreground-color`, `--transition-duration` |
| Sanity types and fields | camelCase | `homePage`, `mainMedia`, `showInWork` |

### BEM blocks in use

| Block | Where | Elements |
|---|---|---|
| `site-header` | Base layout | `__logo`, `__nav`, `__link`, `__merch`, `__product-title`, `__product`, `__price`, `__buy` |
| `site-footer` | Base layout | `__link` |
| `media` | Media.astro (no wrapper element) | `__image`, `__poster`, `__video`, `__play`, `__loop`, `__player` |
| `news-panel` | NewsPanel.astro, in the header beside the logo. The same element stays open beside About (no second copy) | `__head`, `__title`, `__close`, `__body`, `__bar`, `__titles`, `__item-title`, `__arrows`, `__arrow`, `__images`, `__image` |
| `intro` | Base layout, the opening plate on first arrival | `__plate` |
| `site-scroll` | Base layout, the scrolling area around the page content | none |
| `project-cover` | Created by `cover.js`: the black layer that opens and closes a project | none |
| `project-roulette` | ProjectRoulette.astro, the home carousel | `__viewport`, `__track`, `__slide`, `__card`, `__media` |
| `project-reel` | ProjectReel.astro, on /work | `__stage`, `__stack`, `__card`, `__run`, `__brand`, `__title` |
| `work-list` | ProjectList.astro, the Work list on /work. Styled in `project-list.css` | `__head`, `__title`, `__filters`, `__filter`, `__layout`, `__table`, `__rows`, `__row`, `__brand`, `__panel`, `__still`, `__empty` |
| `project` | projects/[slug] | `__header`, `__title`, `__meta`, `__media`, `__body`, `__description`, `__credits`, `__credit`, `__credit-label`, `__credit-value` |
| `archive` | archive. A native snapping scroll; rows that pass the bar move above it (`archive.js`) | `__item`, `__index`, `__title`, `__brand`, `__year`, `__time`, `__snaps`, `__snap` (invisible snap points, one per row, that never move) |
| `awards`, `award` | awards | `award__text`, `__ceremony`, `__category`, `__work`, `__image`, `__year` |
| `merch-reel` | merch page | `__stage`, `__stack`, `__card`, `__run` |
| `product-strip` | product page. A row on desktop, a column on phone; the merch pile behind fades away as it opens | `__stage`, `__pile`, `__ghost`, `__track`, `__card`, `__run` |
| `about-panel`, `team`, `team-member` | About panel in the header. There is no /about route | `about-panel__head`, `__title`, `__tabs`, `__tab`, `__close`, `__text`, `__team-link`, `__contact`, `__footer` (phone only), `team__list`, `team-member__name`, `__image`, `__card`, `__position`, `__description`, `__track`, `__track-label` |
| `mirror` | Hidden /mirror page, opened by three quick clicks on the header logo. No header, footer or router | `__canvas`, `__video`, `__logo`, `__bar`, `__enter`, `__toggle`, `__slash`, `__close` |
| `page-title`, `empty-message`, `rich-text` | Shared | none |

- **Stylesheet names that differ from their component:** `AboutPanel.astro` → `about.css`, `NewsPanel.astro` →
  `news.css`, and `ProjectList.astro` → `project-list.css` (block `work-list`).

- **`.media__*` elements** sit directly inside whatever wraps them, such as `.project-roulette__media` or `.award__image`.
  Size and crop media through the wrapper.
- **`.project__media`** gets `data-kind="video"` or `data-kind="image"` from the main media's type, for styling.
- **JavaScript hooks** use data attributes, not classes: `data-autoplay`, `data-news-panel`,
  `data-vimeo-player`. Renaming a class must never break a script.
- **Renaming:** when you rename a class, search `components`, `layouts`, `pages`, `scripts` and `styles`.

## Content model (Sanity)

| Type | Kind | Notes |
|---|---|---|
| `project` | Documents | `showInWork` and `showInArchive` switches. A project can be on both, one or neither. `credits` is one line per credit, "Role: Name", shown in two columns (`creditRows` in `lib/format.js`) |
| `homePage` | Single document | Ordered references to projects |
| `award` | Documents | `ceremony`, `category`, `work`, `year`, `image` |
| `product` | Documents | `title`, `price` (a string with currency), `url`, `images` |
| `aboutPage` | Single document | `content` (rich text) and a `team` array. Shown in the header About panel |
| `siteSettings` | Single document | Site name, SEO description, email, social links, `news` (items with a title, one or more images and an optional title link). Opens in the header a few seconds after arrival; closing it lasts until a new tab |
| `media` | Object | `kind` is `video` or `image`. Videos are links (`videoUrl`): Vimeo, or a direct MP4 |
| `richText` | Array | Paragraphs, bold, italic and links only |

Single documents have fixed IDs equal to their type name and are listed in `SINGLETONS` in
`studio/schemaTypes/index.js`. When adding a content type, also add it to `CONTENT_TYPES` there, for the
"Put changes live" count, and to `presentationTool` locations in `studio/sanity.config.js`.

## Environments

| Environment | Mode | Shows |
|---|---|---|
| Production | Static build | Published content. Deploys only from "Put changes live" or a push to the `production` branch |
| Preview | `SITE_MODE=preview`, server-rendered on the `preview` branch | Drafts. Only opens from the Studio |
| Local | `npm run dev:edit` (preview and Studio) or `npm run dev:all` (site and Studio) | |

- **Work on `main`; ship by merging into `production`.** Netlify's production branch is `production`, not `main`.
- **Production deploys cost Netlify credits.** Never add a webhook that deploys on every publish.
- **`SANITY_READ_TOKEN` reads drafts.** It's only allowed in `web/.env` and Netlify's `preview` branch. Never put it
  in `netlify.toml`, a `PUBLIC_` variable or a `SANITY_STUDIO_` variable.

## Gotchas

- **Click-to-edit adds invisible characters** to the fields listed in `EDITABLE_FIELDS` in `lib/content.js`. Never
  add a field there that's used in a URL, an attribute, a `transition:name` or a comparison. Wrap such values in
  `stegaClean()` if in doubt.
- **Page content fades** between pages (`fadeContentOut` and `revealContent` in `page.js`); the header has its own
  motion. Opening or closing a project uses the black cover instead. Anything a script has to place, such as a
  reel or strip, must be in place by the end of its setup, before the fade-in starts. Wait on animations with a timer
  fallback too, because a background tab never starts them.
- **Preview has no page transitions.** It uses normal page loads because click-to-edit needs a stable page, so test
  transitions with `npm run dev` or `dev:all`.
- **Project pages look up their slug at runtime.** `pages/projects/[slug].astro` uses the slug instead of
  `getStaticPaths` props, because preview mode renders on the server.
- **Sanity UI in the Studio uses `gap`, not `space`.** `space` is silently ignored in this version of `@sanity/ui`.
- **Icons** are imported from their own path: `import { StarIcon } from '@sanity/icons/Star'`. The root export
  no longer has them.
- **Vimeo playback can't be checked in the built-in browser pane.** It fails even on Vimeo's own player page.
  Check video in a real browser.
