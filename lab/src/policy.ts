// Server-side enforcement of who may do what. Workflow guards are advisory (a write token
// bypasses them), so every mutating API route calls these functions first.
//
// Identity comes from the caller's own Sanity token, resolved server-side (never from a
// request field). Robot tokens have ids starting "p-" (F33: an actor's self-reported kind
// is not trustworthy). The runtime and the agent are robot tokens with known ids.
import {canonicalize} from './canonical.ts'
import {sha256Hex} from './hash.ts'

export type ActorClass = 'person' | 'runtime' | 'agent' | 'unknown-robot'

export function classifyActor(id: string, known: {runtimeId: string; agentId: string}): ActorClass {
  if (!id) throw new Error('empty actor id')
  if (id === known.runtimeId) return 'runtime'
  if (id === known.agentId) return 'agent'
  return id.startsWith('p-') ? 'unknown-robot' : 'person'
}

export type LifecycleAction = 'propose' | 'lock' | 'record-fetch' | 'record-analysis' | 'hash-mismatch' | 'unblind' | 'approve-verdict'

const ALLOWED: Record<LifecycleAction, readonly ActorClass[]> = {
  propose: ['person', 'agent'],
  lock: ['person'],
  'record-fetch': ['runtime'],
  'record-analysis': ['runtime'],
  'hash-mismatch': ['runtime'],
  unblind: ['person'],
  'approve-verdict': ['person'],
}

export class Forbidden extends Error {}

export function authorize(action: LifecycleAction, actor: ActorClass): void {
  if (!ALLOWED[action].includes(actor)) throw new Forbidden(`${actor} may not ${action}`)
}

export interface VerdictCheckInput {
  hypothesisDefinition: string // hypothesis.definition as stored now
  preregistration: {hypothesisId: string; sha256: string; canonicalJson: string}
  trial: {hypothesisId: string; lockSha256: string; blinded: boolean; computedVerdict: string; stage: string}
  outcome: string // the verdict a person is approving
}

/**
 * A verdict may exist only for a trial whose pre-registration hash still matches.
 * Returns the reasons it may not be published; an empty list means it may.
 */
export async function verdictBlockers(input: VerdictCheckInput): Promise<string[]> {
  const {hypothesisDefinition, preregistration, trial, outcome} = input
  const reasons: string[] = []
  if (trial.hypothesisId !== preregistration.hypothesisId) reasons.push('trial and pre-registration name different hypotheses')
  if ((await sha256Hex(preregistration.canonicalJson)) !== preregistration.sha256) reasons.push('pre-registration record is corrupt')
  let current: string | null = null
  try {
    current = await sha256Hex(canonicalize(JSON.parse(hypothesisDefinition)))
  } catch {
    reasons.push('hypothesis definition is not valid JSON')
  }
  if (current !== null && current !== preregistration.sha256) reasons.push('hypothesis was edited after lock: file a deviation')
  if (trial.lockSha256 !== preregistration.sha256) reasons.push('trial ran against a different hash')
  if (trial.blinded) reasons.push('trial is still blinded')
  if (trial.stage !== 'unblinded') reasons.push(`trial is in stage "${trial.stage}", not "unblinded"`)
  if (outcome !== trial.computedVerdict) reasons.push(`the locked rules give "${trial.computedVerdict}", not "${outcome}"`)
  return reasons
}
