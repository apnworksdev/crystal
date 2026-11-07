# Crystal

Portfolio site built with Astro and Sanity in plain JavaScript, hosted on Netlify.

| Environment | What it shows | How it updates | Rendering |
|---|---|---|---|
| **Production** | Published content | "Put changes live" in the Studio | Static |
| **Preview** | Drafts and published content | On every edit | Server, Studio sign-in required |
| **Test** (optional) | Any dataset you choose | Pushing to a branch | Static |

## Editing workflow

1. Edit in the Studio, using **Presentation** to see the draft next to the form.
2. Click **Publish** when it's approved. The public site doesn't change yet.
3. Open **Put changes live** when a batch is ready. This starts one production deploy.

Each production deploy uses Netlify credits, and so does any push to `main`.

## Run locally

```bash
npm install
npm run dev
```

The site uses the sample content in `src/lib/placeholders.js` until `SANITY_PROJECT_ID` is set.

## Setup and deploy

[SETUP.md](SETUP.md) covers creating the Sanity project, where each environment variable goes, and
deploying production and the preview to Netlify.

## Add a test environment

Any other branch gets a free static branch deploy, which is enough to test code. To test risky content
model changes, create a `staging` dataset and set `SANITY_DATASET=staging` for that branch in Netlify.
The dataset doesn't stay in sync with `production` on its own.

## Page transitions

`<ClientRouter />` in `src/layouts/Base.astro` handles navigation. To morph an element between pages,
give it the same `transition:name` on both. The project image and title already do this.

Preview uses normal page loads because click-to-edit needs a stable page, so check transitions on
`npm run dev` or a branch deploy.

Scripts added later should run inside an `astro:page-load` listener, because normal page-load events
only fire on the first visit:

```js
document.addEventListener('astro:page-load', () => {
  // set up the page here
});
```

## Click-to-edit fields

`src/lib/content.js` lists the fields Presentation can edit in `EDITABLE_FIELDS`. It adds invisible
characters to those strings in preview, so never add a field used in a URL, an attribute or a comparison.
