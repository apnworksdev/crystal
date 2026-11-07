import { CogIcon } from '@sanity/icons/Cog';
import { HomeIcon } from '@sanity/icons/Home';
import { UserIcon } from '@sanity/icons/User';
import { UsersIcon } from '@sanity/icons/Users';
import { defineArrayMember, defineField, defineType } from 'sanity';
import { imageField } from './fields.js';

export const homePage = defineType({
  name: 'homePage',
  title: 'Home page',
  type: 'document',
  icon: HomeIcon,
  fields: [
    defineField({
      name: 'projects',
      type: 'array',
      description: 'Shown on the home page in this order. Drag to reorder.',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'project' }] })],
      validation: (rule) => rule.unique(),
    }),
  ],
  preview: { prepare: () => ({ title: 'Home page' }) },
});

export const aboutPage = defineType({
  name: 'aboutPage',
  title: 'About page',
  type: 'document',
  icon: UsersIcon,
  fields: [
    defineField({
      name: 'content',
      type: 'richText',
    }),
    defineField({
      name: 'team',
      type: 'array',
      description: 'Drag to reorder.',
      of: [
        defineArrayMember({
          name: 'teamMember',
          title: 'Team member',
          type: 'object',
          icon: UserIcon,
          fields: [
            imageField({ name: 'image' }),
            defineField({ name: 'name', type: 'string', validation: (rule) => rule.required() }),
            defineField({ name: 'position', type: 'string' }),
            defineField({ name: 'description', type: 'text', rows: 4 }),
            defineField({
              name: 'favouriteTrack',
              title: 'Favourite track',
              type: 'string',
              description: 'For example: Frontier Psychiatrist — The Avalanches',
            }),
          ],
          preview: {
            select: { title: 'name', subtitle: 'position', media: 'image' },
          },
        }),
      ],
    }),
  ],
  preview: { prepare: () => ({ title: 'About page' }) },
});

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site settings',
  type: 'document',
  icon: CogIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Site name',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Search description',
      type: 'text',
      rows: 2,
      description: 'Shown by search engines. About 150 characters.',
      validation: (rule) => rule.max(160),
    }),
    defineField({
      name: 'email',
      type: 'string',
      validation: (rule) => rule.email(),
    }),
    defineField({
      name: 'links',
      title: 'Social links',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({ name: 'label', type: 'string', validation: (rule) => rule.required() }),
            defineField({ name: 'url', type: 'url', validation: (rule) => rule.required() }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'popup',
      type: 'object',
      description: 'Shown once per visit, on whichever page a visitor arrives at.',
      fields: [
        defineField({
          name: 'enabled',
          title: 'Show the popup',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'title',
          type: 'string',
          hidden: ({ parent }) => !parent?.enabled,
          validation: (rule) =>
            rule.custom((value, { parent }) =>
              parent?.enabled && !value ? 'Add a title, or turn the popup off.' : true,
            ),
        }),
        imageField({ name: 'image', hidden: ({ parent }) => !parent?.enabled }),
        defineField({
          name: 'link',
          type: 'url',
          hidden: ({ parent }) => !parent?.enabled,
          validation: (rule) => rule.uri({ scheme: ['http', 'https'], allowRelative: true }),
        }),
      ],
    }),
  ],
  preview: { prepare: () => ({ title: 'Site settings' }) },
});
