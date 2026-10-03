import {describe, expect, test} from 'vitest'
import {checkLock, lockHypothesis, REQUIRED_HYPOTHESIS_FIELDS} from '../src/preregistration.ts'

const meta = {lockedAt: '2026-10-04T00:00:00.000Z', lockedBy: 'tester', executedBy: 'vitest'}

function draft(): Record<string, unknown> {
  const h: Record<string, unknown> = {}
  for (const field of REQUIRED_HYPOTHESIS_FIELDS) h[field] = `value-${field}`
  h._id = 'hypothesis-test-v1'
  h.version = 1
  h.predictor = {variable: 'precipitation', threshold: 0.2}
  return h
}

describe('preregistration lock', () => {
  test('refuses to lock a hypothesis with missing fields', async () => {
    const h = draft()
    delete h.predictor
    await expect(lockHypothesis(h, meta)).rejects.toThrow(/missing predictor/)
  })

  test('refuses dotted ids', async () => {
    await expect(lockHypothesis({...draft(), _id: 'hypothesis.test.v1'}, meta)).rejects.toThrow(/dot/)
  })

  test('an unchanged hypothesis matches its lock, even re-ordered', async () => {
    const h = draft()
    const lock = await lockHypothesis(h, meta)
    const reordered = Object.fromEntries(Object.entries(h).reverse())
    expect(await checkLock(reordered, lock)).toEqual({ok: true, sha256: lock.sha256})
  })

  test('an edit after lock is detected as a hash mismatch', async () => {
    const h = draft()
    const lock = await lockHypothesis(h, meta)
    const edited = {...h, predictor: {variable: 'precipitation', threshold: 0.3}}
    expect(await checkLock(edited, lock)).toMatchObject({ok: false, reason: 'hash-mismatch', expected: lock.sha256})
  })

  test('a tampered lock record is detected', async () => {
    const lock = await lockHypothesis(draft(), meta)
    const tampered = {...lock, canonicalJson: lock.canonicalJson.replace('0.2', '0.3')}
    expect(await checkLock(draft(), tampered)).toMatchObject({ok: false, reason: 'lock-corrupt'})
  })
})
