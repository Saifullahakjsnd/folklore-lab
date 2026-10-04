// Types and helpers shared by the /replicate page and its worker. The data is a static bundle
// shipped with the site (web/data/replication.json), so replication needs no network at all.
import type {PreregistrationLock} from '@folklore/lab/preregistration'
import type {FamilyResult, UnitTable} from '@folklore/lab/trials'

export interface ReplicationTrial {
  hypothesis: Record<string, unknown> & {_id: string; version: number}
  lock: PreregistrationLock
  units: UnitTable
  unitsSha256: string
  published: FamilyResult
}

export interface ReplicationBundle {
  snapshotSha256: string
  numbersSha256: string
  resultsGitSha: string
  resultsRunAt: string
  resultsNode: string
  familySlots: string[]
  trials: ReplicationTrial[]
}

export type WorkerMessage =
  | {type: 'progress'; hypothesisId: string; step: 'lock' | 'units' | 'statistics'; ok: boolean; detail?: string}
  | {type: 'done'; family: FamilyResult[]; numbersSha256: string; ms: number}
  | {type: 'error'; message: string}

