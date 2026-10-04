import {missingFields} from '@folklore/lab/preregistration'
import {defineField, defineType, type ConditionalPropertyCallbackContext} from 'sanity'

// Pre-registration encoded as data:
// - `definition` is the full hypothesis as JSON: the exact content that gets hashed.
// - Once locked (status "preregistered"), every field is read-only in the Studio. A change
//   after lock is a deviation and a new version, never an edit (enforced again server-side).

const lockedAfterDraft = ({document}: ConditionalPropertyCallbackContext) =>
  Boolean(document?.status && document.status !== 'draft')

const publishedId = (id: string) => id.replace(/^drafts\./, '').replace(/^versions\.[^.]+\./, '')

export const hypothesis = defineType({
  name: 'hypothesis',
  title: 'Hypothesis',
  type: 'document',
  readOnly: lockedAfterDraft,
  fields: [
    defineField({name: 'title', type: 'string', validation: (r) => r.required()}),
    defineField({
      name: 'status',
      type: 'string',
      readOnly: true,
      initialValue: 'draft',
      options: {list: ['draft', 'preregistered', 'superseded']},
      description: 'Set only by the Lock action and by deviations.',
    }),
    defineField({name: 'version', type: 'number', initialValue: 1, validation: (r) => r.required().integer().min(1)}),
    defineField({
      name: 'draftedBy',
      type: 'string',
      options: {list: ['person', 'agent']},
      description: 'Agent drafts can be edited by a person, but the agent can never lock or approve.',
    }),
    defineField({name: 'proverb', type: 'reference', to: [{type: 'proverb'}], validation: (r) => r.required()}),
    defineField({name: 'location', type: 'reference', to: [{type: 'location'}], validation: (r) => r.required()}),
    defineField({name: 'statement', type: 'text', rows: 3, validation: (r) => r.required()}),
    defineField({
      name: 'definition',
      title: 'Definition (JSON, hashed at lock)',
      type: 'text',
      rows: 30,
      description:
        'The complete operational definition: data query, time rules, predictor, outcome, test, bootstrap, smallest effect of interest, verdict rules. Hashed as canonical JSON when locked.',
      validation: (r) =>
        r.required().custom((value, context) => {
          if (!value) return true
          let parsed: Record<string, unknown>
          try {
            parsed = JSON.parse(value) as Record<string, unknown>
          } catch (error) {
            return `Not valid JSON: ${(error as Error).message}`
          }
          const missing = missingFields(parsed)
          if (missing.length > 0) return `Missing required fields: ${missing.join(', ')}`
          const docId = context.document?._id ? publishedId(context.document._id) : undefined
          if (docId && parsed._id !== docId) return `definition._id must equal the document id "${docId}"`
          if (String(parsed._id).includes('.')) return 'Ids must not contain dots (dotted ids are private in Sanity)'
          if (parsed.version !== context.document?.version) return 'definition.version must equal the version field'
          return true
        }),
    }),
    defineField({name: 'supersedes', type: 'reference', to: [{type: 'hypothesis'}], weak: true}),
  ],
  preview: {
    select: {title: 'title', status: 'status', version: 'version'},
    prepare: ({title, status, version}) => ({title, subtitle: `v${version} · ${status ?? 'draft'}`}),
  },
})
