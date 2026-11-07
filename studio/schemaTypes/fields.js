import { defineArrayMember, defineField, defineType } from 'sanity';

export const altField = defineField({
  name: 'alt',
  title: 'Alt text',
  type: 'string',
  description: 'Describes the image for people using screen readers.',
});

/** An image with hotspot cropping and alt text. */
export const imageField = (options) =>
  defineField({
    type: 'image',
    options: { hotspot: true },
    fields: [altField],
    ...options,
  });

/** A video or an image, chosen by the editor. */
export const media = defineType({
  name: 'media',
  title: 'Media',
  type: 'object',
  fields: [
    defineField({
      name: 'kind',
      title: 'Type',
      type: 'string',
      options: {
        list: [
          { title: 'Video', value: 'video' },
          { title: 'Image', value: 'image' },
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
      initialValue: 'video',
    }),
    defineField({
      name: 'videoUrl',
      title: 'Video link',
      type: 'url',
      description:
        'A Vimeo link, for example https://vimeo.com/123456789. For thumbnails, a direct MP4 link from Vimeo’s “Video file links” loads faster.',
      hidden: ({ parent }) => parent?.kind === 'image',
      validation: (rule) =>
        rule.uri({ scheme: ['https'] }).custom((url) => {
          if (!url) return true;
          const isVimeo = /^https:\/\/([\w-]+\.)?vimeo\.com\//.test(url);
          const isFile = /\.(mp4|webm|m4v|mov)(\?|$)/i.test(url);
          return isVimeo || isFile || 'Use a Vimeo link or a direct link to an MP4 file.';
        }),
    }),
    imageField({
      name: 'poster',
      title: 'Poster image',
      description: 'Optional. Shown before the video plays. Vimeo’s own thumbnail is used when this is empty.',
      hidden: ({ parent }) => parent?.kind === 'image',
    }),
    imageField({
      name: 'image',
      hidden: ({ parent }) => parent?.kind !== 'image',
    }),
  ],
  validation: (rule) =>
    rule.custom((value) => {
      if (!value?.kind) return true;
      if (value.kind === 'video' && !value.videoUrl) return 'Add a video link, or switch the type to Image.';
      if (value.kind === 'image' && !value.image?.asset) return 'Upload an image, or switch the type to Video.';
      return true;
    }),
  preview: {
    select: {
      kind: 'kind',
      image: 'image',
      poster: 'poster',
      videoUrl: 'videoUrl',
    },
    prepare: ({ kind, image, poster, videoUrl }) =>
      kind === 'image'
        ? { title: 'Image', media: image }
        : { title: videoUrl || 'Video', media: poster },
  },
});

/** Paragraphs with bold, italics and links. */
export const richText = defineType({
  name: 'richText',
  title: 'Text',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [{ title: 'Paragraph', value: 'normal' }],
      lists: [],
      marks: {
        decorators: [
          { title: 'Bold', value: 'strong' },
          { title: 'Italic', value: 'em' },
        ],
        annotations: [
          {
            name: 'link',
            title: 'Link',
            type: 'object',
            fields: [
              defineField({
                name: 'href',
                title: 'URL',
                type: 'url',
                validation: (rule) => rule.required().uri({ scheme: ['http', 'https', 'mailto'] }),
              }),
            ],
          },
        ],
      },
    }),
  ],
});
