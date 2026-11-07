import netlify from '@astrojs/netlify';
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';

const { SITE_MODE } = { ...loadEnv(process.env.NODE_ENV ?? '', process.cwd(), ''), ...process.env };

// The public site is fully static. Preview mode renders on the server, so it can
// show the newest drafts on every request.
const isPreview = SITE_MODE === 'preview';

// These only exist in preview mode, so they can't reach the public site.
const previewRoutes = {
  name: 'preview-routes',
  hooks: {
    'astro:config:setup': ({ injectRoute, injectScript }) => {
      injectScript('page', `import '/src/preview/visual-editing.js';`);
      injectRoute({
        pattern: '/api/draft-mode/enable',
        entrypoint: './src/preview/enable.js',
      });
    },
  },
};

export default defineConfig({
  output: isPreview ? 'server' : 'static',
  adapter: isPreview ? netlify() : undefined,
  integrations: isPreview ? [previewRoutes] : [],
  // Set this to your real domain once you have one (used for canonical URLs).
  // site: 'https://example.com',
  // Preview pages must always be fresh, so they are never fetched ahead of time.
  prefetch: isPreview ? false : { prefetchAll: true, defaultStrategy: 'hover' },
  env: {
    schema: {
      SITE_MODE: envField.string({ context: 'server', access: 'public', default: 'public' }),
      SANITY_PROJECT_ID: envField.string({ context: 'server', access: 'public', optional: true }),
      SANITY_DATASET: envField.string({ context: 'server', access: 'public', default: 'production' }),
      SANITY_STUDIO_URL: envField.string({
        context: 'server',
        access: 'public',
        default: 'http://localhost:3333',
      }),
      SANITY_READ_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
