import { StarIcon } from '@sanity/icons/Star';
import { defineField, defineType } from 'sanity';
import { imageField } from './fields.js';

export const award = defineType({
  name: 'award',
  title: 'Award',
  type: 'document',
  icon: StarIcon,
  fields: [
    defineField({
      name: 'ceremony',
      title: 'Award',
      type: 'string',
      description: 'For example: Academy Awards',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'category',
      type: 'string',
      description: 'For example: Best Original Score',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'work',
      type: 'string',
      description: 'What won. For example: Spider-Man - Brand New Day, What it’s all about',
    }),
    defineField({
      name: 'year',
      type: 'number',
      validation: (rule) => rule.required().integer().min(1900).max(2100),
    }),
    imageField({ name: 'image' }),
  ],
  orderings: [
    {
      title: 'Year, newest first',
      name: 'yearDesc',
      by: [{ field: 'year', direction: 'desc' }],
    },
  ],
  preview: {
    select: { ceremony: 'ceremony', category: 'category', year: 'year', media: 'image' },
    prepare: ({ ceremony, category, year, media }) => ({
      title: [ceremony, category].filter(Boolean).join(' — '),
      subtitle: year && String(year),
      media,
    }),
  },
});
