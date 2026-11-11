import { DocumentVideoIcon } from '@sanity/icons/DocumentVideo';
import { defineField, defineType } from 'sanity';

export const PROJECT_CATEGORIES = [
  { title: 'Trailer', value: 'trailer' },
  { title: 'Sound design', value: 'sound-design' },
  { title: 'Music', value: 'music' },
  { title: 'Mix', value: 'mix' },
  { title: 'Games', value: 'games' },
  { title: 'Advertisement', value: 'advertisement' },
];

export const project = defineType({
  name: 'project',
  title: 'Project',
  type: 'document',
  icon: DocumentVideoIcon,
  fieldsets: [{ name: 'pages', title: 'Show on', options: { columns: 2 } }],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'URL',
      type: 'slug',
      description: 'The project page address. Generate it from the title.',
      options: { source: 'title', maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'showInWork',
      title: 'Work page',
      type: 'boolean',
      fieldset: 'pages',
      initialValue: false,
    }),
    defineField({
      name: 'showInArchive',
      title: 'Archive page',
      type: 'boolean',
      fieldset: 'pages',
      initialValue: false,
    }),
    defineField({
      name: 'brand',
      type: 'string',
    }),
    defineField({
      name: 'year',
      type: 'number',
      validation: (rule) => rule.required().integer().min(1900).max(2100),
    }),
    defineField({
      name: 'time',
      title: 'Time',
      type: 'string',
      description: 'Timecode in the work list, such as 00:01:58:00.',
    }),
    defineField({
      name: 'categories',
      type: 'array',
      of: [{ type: 'string' }],
      options: { list: PROJECT_CATEGORIES, layout: 'grid' },
    }),
    defineField({
      name: 'mainMedia',
      title: 'Main media',
      type: 'media',
      description: 'Shown at the top of the project page.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'thumbnail',
      type: 'media',
      description: 'Shown in lists of projects. Videos play muted on a loop. Leave empty to use the main media.',
    }),
    defineField({
      name: 'description',
      type: 'richText',
    }),
    defineField({
      name: 'credits',
      type: 'richText',
    }),
  ],
  orderings: [
    {
      title: 'Year, newest first',
      name: 'yearDesc',
      by: [
        { field: 'year', direction: 'desc' },
        { field: 'title', direction: 'asc' },
      ],
    },
  ],
  preview: {
    select: {
      title: 'title',
      brand: 'brand',
      year: 'year',
      thumbImage: 'thumbnail.image',
      thumbPoster: 'thumbnail.poster',
      mainImage: 'mainMedia.image',
      mainPoster: 'mainMedia.poster',
    },
    prepare: ({ title, brand, year, thumbImage, thumbPoster, mainImage, mainPoster }) => ({
      title,
      subtitle: [brand, year].filter(Boolean).join(' · '),
      media: thumbImage || thumbPoster || mainImage || mainPoster,
    }),
  },
});
