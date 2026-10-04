import {defineArrayMember, defineField, defineType} from 'sanity'

const API_VERSION = '2026-06-09'

// One document per snapshot; its 32 download chunks are an array inside it (a document per
// chunk would spend the document cap on bookkeeping).
export const dataSnapshot = defineType({
  name: 'dataSnapshot',
  title: 'Data snapshot',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({name: 'snapshotId', type: 'string'}),
    defineField({name: 'source', type: 'string'}),
    defineField({name: 'attribution', type: 'string'}),
    defineField({name: 'licence', type: 'url'}),
    defineField({name: 'snapshotSha256', type: 'string'}),
    defineField({name: 'lockManifestSha256', type: 'string'}),
    defineField({name: 'spec', title: 'Query spec (JSON)', type: 'text', rows: 12}),
    defineField({
      name: 'chunks',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'chunk',
          fields: [
            defineField({name: 'pointId', type: 'string'}),
            defineField({name: 'startDate', type: 'date'}),
            defineField({name: 'endDate', type: 'date'}),
            defineField({name: 'queryUrl', type: 'url'}),
            defineField({name: 'retrievedAt', type: 'datetime'}),
            defineField({name: 'sha256', type: 'string'}),
            defineField({name: 'bytes', type: 'number'}),
            defineField({name: 'fileUrl', title: 'Release asset URL', type: 'url'}),
            defineField({name: 'gridLatitude', type: 'number'}),
            defineField({name: 'gridLongitude', type: 'number'}),
          ],
          preview: {
            select: {p: 'pointId', s: 'startDate', e: 'endDate'},
            prepare: ({p, s, e}) => ({title: `${p} ${s} → ${e}`}),
          },
        }),
      ],
    }),
  ],
  preview: {select: {title: 'snapshotId', subtitle: 'snapshotSha256'}},
})

const STAGES = ['draft', 'preregistered', 'dataFetched', 'analysedBlinded', 'unblinded', 'verdictApproved', 'abandoned']

// Every number on a trial comes from lab/stats.ts; nothing here is typed by hand.
export const trial = defineType({
  name: 'trial',
  title: 'Trial',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({name: 'preregistration', type: 'reference', to: [{type: 'preregistration'}], weak: true}),
    defineField({name: 'hypothesisId', type: 'string'}),
    defineField({name: 'slot', type: 'string'}),
    defineField({name: 'lockSha256', title: 'Lock hash the trial ran against', type: 'string'}),
    defineField({name: 'dataSnapshot', type: 'reference', to: [{type: 'dataSnapshot'}], weak: true}),
    defineField({name: 'snapshotSha256', type: 'string'}),
    defineField({name: 'stage', type: 'string', options: {list: STAGES}}),
    defineField({
      name: 'stageHistory',
      description: 'Transitions as an array in this document, not one document per event.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'transition',
          fields: [
            defineField({name: 'from', type: 'string'}),
            defineField({name: 'to', type: 'string'}),
            defineField({name: 'at', type: 'datetime'}),
            defineField({name: 'by', type: 'string'}),
            defineField({name: 'actorKind', type: 'string', options: {list: ['person', 'agent', 'runtime']}}),
            defineField({name: 'note', type: 'string'}),
          ],
        }),
      ],
    }),
    defineField({name: 'test', type: 'string'}),
    defineField({name: 'n', type: 'number'}),
    defineField({name: 'excluded', type: 'number'}),
    defineField({
      name: 'counts',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'count',
          fields: [defineField({name: 'name', type: 'string'}), defineField({name: 'value', type: 'number'})],
        }),
      ],
    }),
    defineField({name: 'statistic', type: 'number'}),
    defineField({name: 'p', type: 'number'}),
    defineField({name: 'adjustedP', title: 'Holm-adjusted p', type: 'number'}),
    defineField({name: 'effect', type: 'number'}),
    defineField({name: 'effectUnits', type: 'string'}),
    defineField({name: 'ciLow', title: 'CI low (95%)', type: 'number'}),
    defineField({name: 'ciHigh', title: 'CI high (95%)', type: 'number'}),
    defineField({name: 'undefinedResamples', type: 'number'}),
    defineField({name: 'nullValue', type: 'number'}),
    defineField({name: 'sesoi', title: 'Smallest effect of interest', type: 'number'}),
    defineField({name: 'computedVerdict', type: 'string', options: {list: ['Supported', 'Contradicted', 'Not supported', 'Inconclusive']}}),
    defineField({name: 'blinded', type: 'boolean', description: 'Results stay hidden until a person unblinds.'}),
    defineField({name: 'runAt', type: 'datetime'}),
    defineField({name: 'gitSha', type: 'string'}),
    defineField({name: 'reproducedInCi', type: 'boolean'}),
  ],
  preview: {
    select: {title: 'hypothesisId', stage: 'stage', verdict: 'computedVerdict', blinded: 'blinded'},
    prepare: ({title, stage, verdict, blinded}) => ({title, subtitle: `${stage ?? ''}${blinded ? ' · blinded' : verdict ? ` · ${verdict}` : ''}`}),
  },
})

// A verdict may exist only for a trial whose lock hash still matches its pre-registration,
// and must equal the verdict the code computed. Checked here and again on the server.
export const verdict = defineType({
  name: 'verdict',
  title: 'Verdict',
  type: 'document',
  fields: [
    defineField({
      name: 'trial',
      type: 'reference',
      to: [{type: 'trial'}],
      validation: (r) =>
        r.required().custom(async (ref, context) => {
          if (!ref?._ref) return true
          const client = context.getClient({apiVersion: API_VERSION})
          const found = await client.fetch<{lockSha256?: string; blinded?: boolean; prereg?: {sha256?: string}} | null>(
            `*[_id == $id][0]{lockSha256, blinded, "prereg": preregistration->{sha256}}`,
            {id: ref._ref},
          )
          if (!found) return 'Trial not found'
          if (!found.prereg?.sha256 || found.prereg.sha256 !== found.lockSha256) {
            return 'The trial ran against a hash that does not match its pre-registration; no verdict allowed'
          }
          if (found.blinded) return 'The trial is still blinded'
          return true
        }),
    }),
    defineField({
      name: 'outcome',
      type: 'string',
      options: {list: ['Supported', 'Contradicted', 'Not supported', 'Inconclusive'], layout: 'radio'},
      validation: (r) =>
        r.required().custom(async (outcome, context) => {
          const ref = (context.document?.trial as {_ref?: string} | undefined)?._ref
          if (!outcome || !ref) return true
          const computed = await context
            .getClient({apiVersion: API_VERSION})
            .fetch<string | null>(`*[_id == $id][0].computedVerdict`, {id: ref})
          return computed === outcome ? true : `The locked rules give "${computed}"; a verdict cannot differ from the code`
        }),
    }),
    defineField({name: 'summary', title: 'Plain-language summary', type: 'text', rows: 4}),
    defineField({name: 'caveats', type: 'array', of: [defineArrayMember({type: 'string'})]}),
    defineField({name: 'approvedBy', type: 'string', readOnly: true, description: 'Set by the server on approval; must be a person.'}),
    defineField({name: 'approvedAt', type: 'datetime', readOnly: true}),
  ],
  preview: {
    select: {title: 'trial.hypothesisId', outcome: 'outcome'},
    prepare: ({title, outcome}) => ({title: title ?? 'Verdict', subtitle: outcome}),
  },
})
