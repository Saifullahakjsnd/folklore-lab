import {defineArrayMember, defineField, defineType} from 'sanity'

export const proverb = defineType({
  name: 'proverb',
  title: 'Proverb',
  type: 'document',
  fields: [
    defineField({name: 'text', type: 'string', validation: (r) => r.required()}),
    defineField({name: 'origin', type: 'text', rows: 3, description: 'Only what the cited sources say.'}),
    defineField({
      name: 'sources',
      type: 'array',
      of: [defineArrayMember({type: 'citation'})],
      description: 'One citable folklore reference at minimum. Never invented.',
    }),
  ],
  preview: {select: {title: 'text'}},
})
