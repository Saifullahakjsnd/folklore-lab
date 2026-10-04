// POST /api/verdicts/approve  {trialId}   Authorization: Bearer <the caller's own Sanity token>
//
// Server-side enforcement of "a person approves the verdict, never the agent". Workflow guards
// and Studio checks are advisory (a write token bypasses them); this route is the rule that
// holds for anything that goes through the journal's API:
//   - who: the caller is identified by Sanity's /users/me for THEIR token (never a request
//     field); robots are recognised by provider "sanity-token"; people must be on the curator
//     allowlist (FOLKLORE_CURATOR_IDS);
//   - what: the hypothesis must still hash to its pre-registration, the trial must have run on
//     that hash, be unblinded, and the verdict is the one the locked rules computed.
// The verdict is written with a server-held token that never reaches a browser.
import {decideApproval} from '@folklore/lab/approval'
import {createClient} from '@sanity/client'
import {NextResponse, type NextRequest} from 'next/server'
import {API_VERSION, DATASET, PROJECT_ID} from '../../../../lib/sanity'

export const dynamic = 'force-dynamic'

const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*(sanity\.io|sanity\.studio)$|^http:\/\/localhost:\d+$/

function cors(origin: string | null): Record<string, string> {
  return origin && ALLOWED_ORIGIN.test(origin)
    ? {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin'}
    : {}
}

// Small in-memory rate limit per IP (per server instance): 10 requests a minute.
const hits = new Map<string, number[]>()
function limited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > 10
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {status: 204, headers: cors(req.headers.get('origin'))})
}

export async function POST(req: NextRequest) {
  const headers = cors(req.headers.get('origin'))
  const fail = (status: number, reasons: string[]) => NextResponse.json({ok: false, reasons}, {status, headers})

  if (limited(req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown')) return fail(429, ['too many requests'])
  const callerToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!callerToken) return fail(401, ['sign in: send your own Sanity token as a Bearer token'])
  const writeToken = process.env.SANITY_API_WRITE_TOKEN
  if (!writeToken) return fail(503, ['the server has no write token configured; approval is unavailable'])

  let trialId: string
  try {
    trialId = String(((await req.json()) as {trialId?: unknown}).trialId ?? '')
  } catch {
    return fail(400, ['body must be JSON {"trialId": "…"}'])
  }
  if (!/^trial-[a-z0-9-]+$/.test(trialId)) return fail(400, ['invalid trialId'])

  // Who is calling: Sanity answers for the caller's own token.
  const meRes = await fetch(`https://${PROJECT_ID}.api.sanity.io/v2021-06-07/users/me`, {headers: {Authorization: `Bearer ${callerToken}`}, cache: 'no-store'})
  if (!meRes.ok) return fail(401, ['Sanity did not accept your token'])
  const me = (await meRes.json()) as {id?: string; name?: string; provider?: string}
  if (!me.id) return fail(401, ['Sanity returned no identity for your token'])

  const known = {
    curatorIds: (process.env.FOLKLORE_CURATOR_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    runtimeId: process.env.FOLKLORE_RUNTIME_ID ?? '',
    agentId: process.env.FOLKLORE_AGENT_ID ?? '',
  }

  const server = createClient({projectId: PROJECT_ID, dataset: DATASET, apiVersion: API_VERSION, token: writeToken, useCdn: false, perspective: 'published'})
  const data = await server.fetch<{
    trial: {hypothesisId: string; lockSha256: string; blinded: boolean; computedVerdict: string; stage: string} | null
    definition: string | null
    prereg: {hypothesisId: string; sha256: string; canonicalJson: string} | null
    existing: string | null
  }>(
    `{
      "trial": *[_id == $t][0]{hypothesisId, lockSha256, blinded, computedVerdict, stage},
      "definition": *[_id == *[_id == $t][0].hypothesisId][0].definition,
      "prereg": *[_type == "preregistration" && hypothesisId == *[_id == $t][0].hypothesisId][0]{hypothesisId, sha256, canonicalJson},
      "existing": *[_type == "verdict" && trial._ref == $t][0]._id
    }`,
    {t: trialId},
  )
  if (!data.trial || !data.definition || !data.prereg) return fail(404, ['trial, hypothesis or pre-registration not found'])
  if (data.existing) return fail(409, ['a verdict already exists for this trial'])

  const decision = await decideApproval({id: me.id, provider: me.provider, ...(me.name ? {name: me.name} : {})}, known, {
    hypothesisDefinition: data.definition,
    preregistration: data.prereg,
    trial: data.trial,
    outcome: data.trial.computedVerdict,
  })
  if (!decision.ok) return fail(decision.status, decision.reasons)

  const now = new Date().toISOString()
  const verdictId = `verdict-${data.trial.hypothesisId}`
  await server
    .transaction()
    .create({_id: verdictId, _type: 'verdict', trial: {_type: 'reference', _ref: trialId}, outcome: data.trial.computedVerdict, approvedBy: decision.approver, approvedAt: now})
    .patch(trialId, (p) =>
      p.set({stage: 'verdictApproved'}).append('stageHistory', [
        {_key: `approve-${Date.now()}`, _type: 'transition', from: 'unblinded', to: 'verdictApproved', at: now, by: `${decision.approver} via /api/verdicts/approve`, actorKind: 'person'},
      ]),
    )
    .commit()
  return NextResponse.json({ok: true, verdictId, outcome: data.trial.computedVerdict, approvedBy: decision.approver}, {headers})
}
