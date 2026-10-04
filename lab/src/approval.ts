// The server-side decision for "approve this verdict". Pure: the caller's identity comes from
// Sanity's /users/me for the caller's own token, and everything else from the Content Lake.
import {authorize, classifyActor, Forbidden, verdictBlockers, type Caller, type KnownActors, type VerdictCheckInput} from './policy.ts'

export type ApprovalDecision = {ok: true; approver: string} | {ok: false; status: 403 | 409; reasons: string[]}

export async function decideApproval(caller: Caller & {name?: string}, known: KnownActors, check: VerdictCheckInput): Promise<ApprovalDecision> {
  const actor = classifyActor(caller, known)
  try {
    authorize('approve-verdict', actor)
  } catch (error) {
    if (error instanceof Forbidden) return {ok: false, status: 403, reasons: [`${error.message}: only a named curator may approve a verdict`]}
    throw error
  }
  const reasons = await verdictBlockers(check)
  if (reasons.length > 0) return {ok: false, status: 409, reasons}
  return {ok: true, approver: `${caller.name ?? 'curator'} (${caller.id})`}
}
