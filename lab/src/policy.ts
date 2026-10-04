// Server-side enforcement of who may do what. Workflow guards are advisory (a write token
// bypasses them), so every mutating API route calls these functions first.
//
// Identity comes from the caller's own Sanity token, resolved server-side via /users/me
// (never from a request field). A robot token is recognised by Sanity's own report,
// provider "sanity-token", not by the shape of its id: in this project a robot's
// account-global id starts "g-", so F33's "p-" prefix rule would class robots as people
// (verified 2026-10-04). People must also be named curators (an allowlist).
import {canonicalize} from './canonical.ts'
import {sha256Hex} from './hash.ts'

export type ActorClass = 'curator' | 'person' | 'runtime' | 'agent' | 'unknown-robot'

/** The caller as Sanity's /users/me reports it for their token. */
export interface Caller {
  id: string
  provider: string | undefined
}

export interface KnownActors {
  runtimeId: string
  agentId: string
  curatorIds: readonly string[]
}

export function classifyActor(caller: Caller, known: KnownActors): ActorClass {
  if (!caller.id) throw new Error('empty actor id')
  const robot = caller.provider === 'sanity-token'
  if (robot && caller.id === known.runtimeId) return 'runtime'
  if (robot && caller.id === known.agentId) return 'agent'
  if (robot) return 'unknown-robot'
  return known.curatorIds.includes(caller.id) ? 'curator' : 'person'
}

export type LifecycleAction = 'propose' | 'lock' | 'record-fetch' | 'record-analysis' | 'hash-mismatch' | 'unblind' | 'approve-verdict'

const ALLOWED: Record<LifecycleAction, readonly ActorClass[]> = {
  propose: ['curator', 'person', 'agent'],
  lock: ['curator'],
  'record-fetch': ['runtime'],
  'record-analysis': ['runtime'],
  'hash-mismatch': ['runtime'],
  unblind: ['curator'],
  'approve-verdict': ['curator'],
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
