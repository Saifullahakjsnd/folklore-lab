import {describe, expect, test} from 'vitest'
import {canonicalize} from '../src/canonical.ts'
import {sha256Hex} from '../src/hash.ts'

describe('canonicalize', () => {
  test('is stable across key order and formatting', async () => {
    const a = JSON.parse('{"b": 1, "a": {"y": [1, 2, {"q": true, "p": null}], "x": "s"}}')
    const b = JSON.parse(`{
      "a": { "x": "s",
             "y": [1, 2, {"p": null, "q": true}] },
      "b": 1
    }`)
    expect(canonicalize(a)).toBe('{"a":{"x":"s","y":[1,2,{"p":null,"q":true}]},"b":1}')
    expect(canonicalize(a)).toBe(canonicalize(b))
    expect(await sha256Hex(canonicalize(a))).toBe(await sha256Hex(canonicalize(b)))
  })

  test('keeps array order significant', () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]))
  })

  test('serialises numbers like ECMAScript', () => {
    expect(canonicalize([0.2, 1e21, 1e-7, -0, 50, 0.1 + 0.2])).toBe('[0.2,1e+21,1e-7,0,50,0.30000000000000004]')
  })

  test('sorts keys by UTF-16 code units', () => {
    expect(canonicalize({b: 1, B: 2, a: 3, é: 4})).toBe('{"B":2,"a":3,"b":1,"é":4}')
  })

  test('rejects values JSON cannot represent faithfully', () => {
    expect(() => canonicalize({x: Number.NaN})).toThrow(TypeError)
    expect(() => canonicalize({x: Infinity})).toThrow(TypeError)
    expect(() => canonicalize({x: undefined})).toThrow(TypeError)
    expect(() => canonicalize({x: new Date(0)})).toThrow(TypeError)
  })
})

describe('sha256Hex', () => {
  test('matches the known digest of "abc"', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
