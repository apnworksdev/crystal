import { defineConfig } from 'sanity';
import { presentationTool } from 'sanity/presentation';
import { resolveLocations } from './locations.js';
import { structureTool } from 'sanity/structure';
import { deployTool } from './deployTool.jsx';
import { schemaTypes, SINGLETONS } from './schemaTypes/index.js';

const iconFor = (type) => schemaTypes.find(({ name }) => name === type)?.icon;

const singleton = (S, type, title) =>
  S.listItem()
    .title(title)
    .id(type)
    .icon(iconFor(type))
    .child(S.document().schemaType(type).documentId(type).title(title));

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
            singleton(S, 'homePage', 'Home page'),
            S.documentTypeListItem('project').title('Projects'),
            S.documentTypeListItem('award').title('Awards'),
            S.documentTypeListItem('product').title('Merch'),
            singleton(S, 'aboutPage', 'About page'),
            S.divider(),
            singleton(S, 'siteSettings', 'Site settings'),
          ]),
    }),
    presentationTool({
      previewUrl: {
        initial: process.env.SANITY_STUDIO_PREVIEW_URL || 'http://localhost:4321',
        previewMode: { enable: '/api/draft-mode/enable' },
      },
      resolve: {
        locations: resolveLocations,
      },
    }),
  ],
  tools: (tools) => [...tools, deployTool],
  schema: {
    types: schemaTypes,
    // Pages with a single document can't be created again from the "new" menu.
    templates: (templates) => templates.filter(({ schemaType }) => !SINGLETONS.includes(schemaType)),
  },
  document: {
    actions: (actions, { schemaType }) =>
      SINGLETONS.includes(schemaType)
        ? actions.filter(({ action }) => action && ['publish', 'discardChanges', 'restore'].includes(action))
        : actions,
  },
});
