import type {SchemaTypeDefinition} from 'sanity'
import {citation} from './citation'
import {deviation, erratum} from './deviation'
import {hypothesis} from './hypothesis'
import {location} from './location'
import {preregistration} from './preregistration'
import {proverb} from './proverb'
import {dataSnapshot, trial, verdict} from './results'

export const schemaTypes: SchemaTypeDefinition[] = [
  citation,
  proverb,
  location,
  hypothesis,
  preregistration,
  deviation,
  erratum,
  dataSnapshot,
  trial,
  verdict,
]

/** Types that are written once and never edited or deleted from the Studio. */
export const APPEND_ONLY_TYPES = ['preregistration', 'deviation', 'erratum', 'dataSnapshot', 'trial']
