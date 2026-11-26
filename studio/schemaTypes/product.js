import { BasketIcon } from '@sanity/icons/Basket';
import { defineField, defineType } from 'sanity';
import { imageField } from './fields.js';

export const product = defineType({
  name: 'product',
  title: 'Product',
  type: 'document',
  icon: BasketIcon,
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
      description: 'The product page address. Generate it from the title.',
      options: { source: 'title', maxLength: 96 },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'price',
      type: 'string',
      description: 'Shown as written, including the currency. A number alone gets a dollar sign: 15 shows as $15.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'url',
      title: 'Shop link',
      type: 'url',
      description: 'Where visitors buy the product. Shown on the product page.',
      validation: (rule) => rule.required().uri({ scheme: ['http', 'https'] }),
    }),
    defineField({
      name: 'size',
      type: 'number',
      description:
        'How big the product shows in the merch pile and on its page. 1 is the size of a cap; 2 is twice as wide, like a tote bag.',
      initialValue: 1,
      validation: (rule) => rule.min(0.3).max(3),
    }),
    defineField({
      name: 'images',
      type: 'array',
      of: [imageField({ name: 'image' })],
      validation: (rule) => rule.required().min(1),
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'price', media: 'images.0' },
  },
});
