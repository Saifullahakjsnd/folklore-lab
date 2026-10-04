import {defineField, defineType} from 'sanity'

// Written once by the Lock action (or the import of the locks made before any data).
// Never edited or deleted: the document actions for this type are removed in sanity.config.ts.
export const preregistration = defineType({
  name: 'preregistration',
  title: 'Pre-registration',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({name: 'hypothesis', type: 'reference', to: [{type: 'hypothesis'}], weak: true}),
    defineField({name: 'hypothesisId', type: 'string'}),
    defineField({name: 'version', type: 'number'}),
    defineField({name: 'sha256', title: 'SHA-256 of canonical JSON', type: 'string'}),
    defineField({name: 'canonicalJson', type: 'text', rows: 20}),
    defineField({name: 'lockedAt', type: 'datetime'}),
    defineField({name: 'lockedBy', type: 'string', description: 'A person. Never the agent.'}),
    defineField({name: 'executedBy', type: 'string'}),
  ],
  preview: {
    select: {title: 'hypothesisId', sha: 'sha256', at: 'lockedAt'},
    prepare: ({title, sha, at}) => ({title, subtitle: `${String(sha ?? '').slice(0, 12)}… · ${at ?? ''}`}),
  },
})
