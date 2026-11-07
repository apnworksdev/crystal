# Setup and deploy

Do these in order. Part 1 is enough to work locally. Parts 2 and 3 can wait until you deploy.

## Where each setting goes

| Setting | `web/.env` | `studio/.env` | `studio/.env.production` | Netlify, all contexts | Netlify, `preview` branch only |
|---|---|---|---|---|---|
| `SANITY_PROJECT_ID` | ✓ | | | ✓ | |
| `SANITY_DATASET` | ✓ | | | ✓ | |
| `SANITY_READ_TOKEN` (secret) | ✓ | | | | ✓ |
| `SANITY_STUDIO_URL` | ✓ | | | | ✓ |
| `SANITY_STUDIO_PROJECT_ID` | | ✓ | | | |
| `SANITY_STUDIO_DATASET` | | ✓ | | | |
| `SANITY_STUDIO_PREVIEW_URL` | | ✓ local | ✓ deployed | | |

- **`web/.env` and `studio/.env`:** used when you run things on your computer. They're already created and Git ignores them.
- **`studio/.env.production`:** used when you deploy the Studio. It replaces the local preview address with the Netlify one,
  and it's committed because it holds no secrets.
- **Netlify:** set in the Netlify UI, never in `web/netlify.toml`, because that file is committed.
- **`SITE_MODE`:** already set for the `preview` branch in `web/netlify.toml`. Don't add it anywhere else.

`SANITY_READ_TOKEN` can read unpublished drafts. Keep it out of the production context and out of any
`SANITY_STUDIO_` or `PUBLIC_` variable, because those end up in browser code.

## Part 1: Create the Sanity project

### 1. Create the project

From the `studio` folder, log in, then create a project with a public `production` dataset:

```bash
cd studio
```

```bash
npx sanity login
```

```bash
npx sanity init --bare --project-name "Crystal" --dataset-default
```

It prints the project ID. If you'd rather use the website, choose **Create new project** at
[sanity.io/manage](https://www.sanity.io/manage), then create a dataset named `production` with public visibility.

A public dataset only exposes published content. Drafts still need the token.

### 2. Fill in the project ID

| File | Variable | Value |
|---|---|---|
| `web/.env` | `SANITY_PROJECT_ID` | Your project ID |
| `studio/.env` | `SANITY_STUDIO_PROJECT_ID` | Your project ID |

Leave the other values as they are.

### 3. Create the read token

Run `npx sanity manage` from `studio/` to open the project settings, then:

1. Go to **API → Tokens → Add API token**.
2. Name it `Preview`, choose the **Viewer** role, and save.
3. Copy the token into `SANITY_READ_TOKEN` in `web/.env`. Sanity only shows it once.

### 4. Allow the local addresses

Under **API → CORS origins**, make sure these exist, each with **Allow credentials** on:

- `http://localhost:3333` (the Studio, usually added automatically)
- `http://localhost:4321` (the preview)

### 5. Run everything

From the project root, install both packages once:

```bash
npm run setup
```

Then start the Studio and the preview together:

```bash
npm run dev:edit
```

Open the Studio at http://localhost:3333, publish **Site settings** and a project, add the project to
**Home page** and publish that too, then open **Presentation** to check the preview. To see the public site with transitions, stop it and run `npm run dev:all`.

## Part 2: Deploy production to Netlify

### 1. Import the site

1. Push the repo to GitHub, GitLab or Bitbucket.
2. In Netlify, choose **Add new project → Import an existing project**, then pick the repo.
3. Set **Base directory** to `web`. Netlify then reads `web/netlify.toml`, which sets the build command
   (`npm run build`) and the publish folder (`dist`, inside `web/`).
4. Before the first deploy, open **Project configuration → Environment variables** and add these for all contexts:
   - `SANITY_PROJECT_ID`
   - `SANITY_DATASET` = `production`
5. Deploy. Note the site address, for example `https://your-site.netlify.app`.

A push to `main` deploys production and uses credits, so batch your commits. Netlify skips the build
when a push changes nothing in `web/`, so Studio-only changes are free. Builds from the
"Put changes live" button always run.

### 2. Connect the "Put changes live" button

1. In Netlify, go to **Project configuration → Build & deploy → Build hooks → Add build hook**.
   Name it `Sanity`, choose `main`, then copy the URL.
2. In Sanity (`npx sanity manage`), go to **API → Webhooks → Create webhook**:

   | Field | Value |
   |---|---|
   | Name | `Put changes live` |
   | URL | The build hook URL |
   | Dataset | `production` |
   | Trigger on | Create, Update |
   | Filter | `_id == "deployRequest"` |
   | Drafts and versions | Off |
   | HTTP method | POST |

Don't add a webhook that fires on every publish, because it would deploy on each change.

## Part 3: Deploy the preview to Netlify

### 1. Create the branch

```bash
git switch -c preview
```

```bash
git push -u origin preview
```

### 2. Turn on its branch deploy

In Netlify, go to **Project configuration → Build & deploy → Continuous deployment → Branches and deploy contexts**.
Set **Branch deploys** to **Let me add individual branches** and add `preview`.

Its address is `https://preview--your-site.netlify.app`.

### 3. Add the preview-only settings

In **Project configuration → Environment variables**, add these with values for the `preview` branch only.
If your plan doesn't offer branch-specific values, use the **Branch deploys** context.

- `SANITY_READ_TOKEN`: the Viewer token. Mark it as secret, and keep the **Functions** scope on, because the preview reads it while serving pages.
- `SANITY_STUDIO_URL`: the deployed Studio's address. You'll get it in step 5, so use `http://localhost:3333` until then and update it after.

Redeploy the `preview` branch after changing these.

### 4. Allow the preview address

In Sanity, under **API → CORS origins**, add `https://preview--your-site.netlify.app` with **Allow credentials** on.

### 5. Deploy the Studio

Put the preview address in `studio/.env.production` as `SANITY_STUDIO_PREVIEW_URL`, then:

```bash
npm --prefix studio run deploy
```

It asks for a hostname the first time and gives you a `*.sanity.studio` address. Set that as
`SANITY_STUDIO_URL` in Netlify, as in step 3.

### Keeping the preview up to date

Content updates appear on their own. When the site's code changes, merge `main` into `preview` and push.
Branch deploys don't use production credits, but the preview's server rendering uses a little each time
someone views it.

## Check it works

1. Edit a project in the deployed Studio without publishing. Presentation should show the change.
2. Open the preview address in a private window. It should show the locked page.
3. Publish, then open **Put changes live** and confirm. A new deploy should appear in Netlify within a minute.
