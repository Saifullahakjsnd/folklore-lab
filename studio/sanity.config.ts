import {visionTool} from '@sanity/vision'
import {defineConfig, type DocumentActionComponent} from 'sanity'
import {structureTool} from 'sanity/structure'
import {ApproveVerdictAction} from './actions/approveVerdict'
import {LockHypothesisAction} from './actions/lockHypothesis'
import {dataset, projectId} from './env'
import {APPEND_ONLY_TYPES, schemaTypes} from './schemaTypes'
import {structure} from './structure'

const REMOVE_ON_APPEND_ONLY = new Set(['delete', 'duplicate', 'unpublish', 'publish', 'discardChanges'])

// The built-in delete/unpublish stay available on draft hypotheses but disappear once locked.
// The original component is always called, so hook order never changes between renders.
function unlessLocked(original: DocumentActionComponent): DocumentActionComponent {
  const guarded: DocumentActionComponent = (props) => {
    const description = original(props)
    const status = props.published?.status ?? props.draft?.status
    return status && status !== 'draft' ? null : description
  }
  if (original.action) guarded.action = original.action
  return guarded
}

export default defineConfig({
  name: 'folklore-lab',
  title: 'Folklore Lab',
  projectId,
  dataset,
  plugins: [structureTool({structure}), visionTool()],
  schema: {types: schemaTypes},
  document: {
    actions: (prev, {schemaType}) => {
      if (APPEND_ONLY_TYPES.includes(schemaType)) {
        const kept = prev.filter((action) => !REMOVE_ON_APPEND_ONLY.has(action.action ?? ''))
        return schemaType === 'trial' ? [ApproveVerdictAction, ...kept] : kept
      }
      if (schemaType === 'hypothesis') {
        const guarded = prev.map((action) => (['delete', 'unpublish'].includes(action.action ?? '') ? unlessLocked(action) : action))
        return [...guarded, LockHypothesisAction]
      }
      return prev
    },
  },
})
