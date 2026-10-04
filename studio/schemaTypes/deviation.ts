import {defineField, defineType} from 'sanity'

// An edit to a locked hypothesis becomes a deviation plus a new, separately locked version.
export const deviation = defineType({
  name: 'deviation',
  title: 'Deviation',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({name: 'preregistration', type: 'reference', to: [{type: 'preregistration'}], weak: true}),
    defineField({name: 'hypothesisId', type: 'string'}),
    defineField({name: 'lockedSha256', title: 'Hash of the superseded lock', type: 'string'}),
    defineField({name: 'supersededBy', type: 'reference', to: [{type: 'hypothesis'}], weak: true}),
    defineField({name: 'whatChanged', type: 'text', rows: 4}),
    defineField({name: 'reason', type: 'text', rows: 4}),
    defineField({name: 'consequence', type: 'text', rows: 3}),
    defineField({name: 'createdAt', type: 'datetime'}),
    defineField({name: 'dataSeenBeforeDeviation', type: 'boolean'}),
  ],
  preview: {
    select: {title: 'hypothesisId', seen: 'dataSeenBeforeDeviation'},
    prepare: ({title, seen}) => ({title: `Deviation: ${title}`, subtitle: seen ? 'filed after data was seen' : 'filed before any data'}),
  },
})

// A disclosed labelling error that cannot change any result. Not a deviation; hash unchanged.
export const erratum = defineType({
  name: 'erratum',
  title: 'Erratum',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({name: 'hypothesis', type: 'reference', to: [{type: 'hypothesis'}], weak: true}),
    defineField({name: 'hypothesisId', type: 'string'}),
    defineField({name: 'field', type: 'string'}),
    defineField({name: 'locked', title: 'As locked', type: 'string'}),
    defineField({name: 'correct', type: 'string'}),
    defineField({name: 'why', type: 'text', rows: 3}),
    defineField({name: 'effect', type: 'text', rows: 3}),
    defineField({name: 'whyNotADeviation', type: 'text', rows: 4}),
    defineField({name: 'ruledBy', type: 'string'}),
    defineField({name: 'recordedAt', type: 'datetime'}),
    defineField({name: 'dataSeenBeforeErratum', type: 'boolean'}),
  ],
  preview: {select: {title: 'hypothesisId', subtitle: 'field'}},
})
