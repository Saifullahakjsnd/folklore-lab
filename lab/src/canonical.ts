// Canonical JSON (RFC 8785 / JCS subset): object keys sorted by UTF-16 code units,
// no whitespace, ECMAScript number and string serialisation. The same document
// always yields the same bytes, whatever its key order or formatting on disk.

export function canonicalize(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`Non-finite number cannot be canonicalised: ${value}`)
      return JSON.stringify(value)
    case 'string':
      return JSON.stringify(value)
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
      const proto: unknown = Object.getPrototypeOf(value)
      if (proto !== Object.prototype && proto !== null) {
        throw new TypeError('Only plain objects can be canonicalised')
      }
      const record = value as Record<string, unknown>
      const members = Object.keys(record)
        .sort()
        .map((key) => {
          if (record[key] === undefined) throw new TypeError(`Undefined value at key "${key}"`)
          return `${JSON.stringify(key)}:${canonicalize(record[key])}`
        })
      return `{${members.join(',')}}`
    }
    default:
      throw new TypeError(`Cannot canonicalise a ${typeof value}`)
  }
}
