import { defineArrayMember, defineField, defineType } from 'sanity';

const altField = defineField({
  name: 'alt',
  title: 'Alt text',
  type: 'string',
  description: 'Describes the image for screen readers.',
  validation: (rule) => rule.required(),
});

export const project = defineType({
  name: 'project',
  title: 'Project',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'year',
      type: 'number',
      validation: (rule) => rule.required().integer().min(1900),
    }),
    defineField({
      name: 'role',
      type: 'string',
      description: 'For example: Art direction, Web design.',
    }),
    defineField({
      name: 'summary',
      type: 'text',
      rows: 2,
      description: 'One or two sentences shown at the top of the project page.',
      validation: (rule) => rule.required().max(240),
    }),
    defineField({
      name: 'cover',
      title: 'Cover image',
      type: 'image',
      options: { hotspot: true },
      fields: [altField],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'description',
      type: 'text',
      rows: 8,
      description: 'Leave a blank line between paragraphs.',
    }),
    defineField({
      name: 'gallery',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'image',
          options: { hotspot: true },
          fields: [altField],
        }),
      ],
    }),
  ],
  orderings: [
    {
      title: 'Year, newest first',
      name: 'yearDesc',
      by: [{ field: 'year', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'title', subtitle: 'year', media: 'cover' },
    prepare: ({ title, subtitle, media }) => ({ title, subtitle: subtitle && String(subtitle), media }),
  },
});
