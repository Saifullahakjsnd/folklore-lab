import {createClient} from '@sanity/client'

// Public, token-free reads. The production dataset is public, so judges need no login.
export const PROJECT_ID = '1jioj3uy'
export const DATASET = 'production'
export const API_VERSION = '2026-06-09'

export const publicClient = createClient({projectId: PROJECT_ID, dataset: DATASET, apiVersion: API_VERSION, useCdn: true, perspective: 'published'})

export type Fetched<T> = {ok: true; data: T} | {ok: false; error: string}

/** Every page reads through this, so a Sanity failure becomes a visible banner, never a silent fallback. */
export async function fetchPublic<T>(query: string, params: Record<string, unknown> = {}): Promise<Fetched<T>> {
  try {
    return {ok: true, data: await publicClient.fetch<T>(query, params, {next: {revalidate: 60}})}
  } catch (error) {
    return {ok: false, error: `Sanity (project ${PROJECT_ID}, dataset ${DATASET}) is unavailable: ${(error as Error).message}`}
  }
}

export interface HypothesisRow {
  _id: string
  title: string
  status: string
  version: number
  statement: string
  location: {name: string} | null
  preregistration: {sha256: string; lockedAt: string; lockedBy: string} | null
  trial: {
    _id: string
    stage: string
    blinded: boolean
    n: number
    effect: number
    effectUnits: string
    ciLow: number
    ciHigh: number
    adjustedP: number
    computedVerdict: string
  } | null
  verdict: {outcome: string; summary: string} | null
}

export const JOURNAL_QUERY = `*[_type == "hypothesis" && status == "preregistered"] | order(_id asc) {
  _id, title, status, version, statement,
  "location": location->{name},
  "preregistration": *[_type == "preregistration" && hypothesisId == ^._id][0]{sha256, lockedAt, lockedBy},
  "trial": *[_type == "trial" && hypothesisId == ^._id] | order(runAt desc)[0]{
    _id, stage, blinded, n, effect, effectUnits, ciLow, ciHigh, adjustedP, computedVerdict
  },
  "verdict": *[_type == "verdict" && trial._ref in *[_type == "trial" && hypothesisId == ^.^._id]._id][0]{outcome, summary}
}`
