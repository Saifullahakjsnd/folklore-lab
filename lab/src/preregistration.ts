import {canonicalize} from './canonical.ts'
import {sha256Hex} from './hash.ts'

// Fields that must be present before a hypothesis may leave Draft
// (workflow guard "All required fields set").
export const REQUIRED_HYPOTHESIS_FIELDS = [
  '_id',
  'version',
  'proverb',
  'statement',
  'location',
  'period',
  'unit',
  'data',
  'timeRules',
  'predictor',
  'outcome',
  'comparison',
  'effect',
  'test',
  'alpha',
  'smallestEffect',
  'correctionFamily',
  'bootstrap',
  'verdictRules',
  'missingData',
] as const

export interface PreregistrationLock {
  hypothesisId: string
  version: number
  canonicalJson: string
  sha256: string
  lockedAt: string
  lockedBy: string
  executedBy: string
}

export function missingFields(hypothesis: Record<string, unknown>): string[] {
  return REQUIRED_HYPOTHESIS_FIELDS.filter((field) => hypothesis[field] === undefined || hypothesis[field] === null)
}

export async function lockHypothesis(
  hypothesis: Record<string, unknown>,
  meta: {lockedAt: string; lockedBy: string; executedBy: string},
): Promise<PreregistrationLock> {
  const missing = missingFields(hypothesis)
  if (missing.length > 0) throw new Error(`Cannot lock ${String(hypothesis._id)}: missing ${missing.join(', ')}`)
  const id = String(hypothesis._id)
  if (id.includes('.')) throw new Error(`Hypothesis id "${id}" contains a dot; dotted ids are private in Sanity`)
  const canonicalJson = canonicalize(hypothesis)
  return {
    hypothesisId: id,
    version: Number(hypothesis.version),
    canonicalJson,
    sha256: await sha256Hex(canonicalJson),
    ...meta,
  }
}

export type LockCheck =
  | {ok: true; sha256: string}
  | {ok: false; expected: string; actual: string; reason: 'hash-mismatch' | 'lock-corrupt'}

// Recompute the hash of the hypothesis as it stands now and compare it with the lock.
// A mismatch means the hypothesis was edited after lock: the trial must be refused
// and a deviation filed.
export async function checkLock(hypothesis: Record<string, unknown>, lock: PreregistrationLock): Promise<LockCheck> {
  const lockSelfHash = await sha256Hex(lock.canonicalJson)
  if (lockSelfHash !== lock.sha256) {
    return {ok: false, expected: lock.sha256, actual: lockSelfHash, reason: 'lock-corrupt'}
  }
  const actual = await sha256Hex(canonicalize(hypothesis))
  return actual === lock.sha256
    ? {ok: true, sha256: actual}
    : {ok: false, expected: lock.sha256, actual, reason: 'hash-mismatch'}
}
