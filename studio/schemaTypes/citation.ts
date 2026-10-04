import {defineField, defineType} from 'sanity'

// Every stored fact carries a source URL and a retrieval date.
export const citation = defineType({
  name: 'citation',
  title: 'Citation',
  type: 'object',
  fields: [
    defineField({name: 'title', type: 'string'}),
    defineField({name: 'url', title: 'Source URL', type: 'url', validation: (r) => r.required()}),
    defineField({name: 'retrievedAt', title: 'Retrieved', type: 'date', validation: (r) => r.required()}),
    defineField({name: 'note', type: 'text', rows: 2}),
  ],
  preview: {select: {title: 'title', subtitle: 'url'}},
})
