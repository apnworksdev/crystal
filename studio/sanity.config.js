import { defineConfig } from 'sanity';
import { defineLocations, presentationTool } from 'sanity/presentation';
import { structureTool } from 'sanity/structure';
import { deployTool } from './deployTool.jsx';
import { schemaTypes } from './schemaTypes/index.js';

const SINGLETONS = new Set(['siteSettings']);

export default defineConfig({
  name: 'default',
  title: 'Crystal',
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'placeholder',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Content')
          .items([
            S.listItem()
              .title('Site settings')
              .id('siteSettings')
              .child(S.document().schemaType('siteSettings').documentId('siteSettings')),
            S.divider(),
            S.documentTypeListItem('project').title('Projects'),
          ]),
    }),
    presentationTool({
      previewUrl: {
        initial: process.env.SANITY_STUDIO_PREVIEW_URL || 'http://localhost:4321',
        previewMode: { enable: '/api/draft-mode/enable' },
      },
      resolve: {
        locations: {
          project: defineLocations({
            select: { title: 'title', slug: 'slug.current' },
            resolve: (doc) => ({
              locations: doc?.slug
                ? [
                    { title: doc.title || 'Untitled', href: `/work/${doc.slug}` },
                    { title: 'Home', href: '/' },
                  ]
                : [{ title: 'Home', href: '/' }],
            }),
          }),
          siteSettings: defineLocations({
            message: 'Used across the whole site',
            tone: 'positive',
            locations: [
              { title: 'Home', href: '/' },
              { title: 'About', href: '/about' },
            ],
          }),
        },
      },
    }),
  ],
  tools: (tools) => [...tools, deployTool],
  schema: {
    types: schemaTypes,
    // Keep site settings as a single document.
    templates: (templates) => templates.filter(({ schemaType }) => !SINGLETONS.has(schemaType)),
  },
  document: {
    actions: (actions, { schemaType }) =>
      SINGLETONS.has(schemaType)
        ? actions.filter(({ action }) => action && ['publish', 'discardChanges', 'restore'].includes(action))
        : actions,
  },
});
