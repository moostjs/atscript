import { describe, expect, it } from 'vitest'

import { SemanticPrimitiveNode } from '../parser/nodes/primitive-node'
import { primitives } from '../defaults/primitives'

function getPrimitive(name: string): SemanticPrimitiveNode {
  return new SemanticPrimitiveNode(name, primitives[name])
}

function resolvePrimitive(rootName: string, chain: string[]): SemanticPrimitiveNode | undefined {
  let node = getPrimitive(rootName)
  for (const segment of chain) {
    const child = node.props.get(segment)
    if (!child) { return undefined }
    // Child props are SemanticPrimitiveNode instances
    node = child as unknown as SemanticPrimitiveNode
  }
  return node
}

describe('sized integers', () => {
  it('number.int should have @expect.int annotation', () => {
    const numPrim = getPrimitive('number')
    const intPrim = numPrim.props.get('int')
    expect(intPrim).toBeDefined()
    expect(intPrim!.annotations).toContainEqual(
      expect.objectContaining({ name: 'expect.int' })
    )
  })

  it('number.int.int8 should exist with correct range', () => {
    const numPrim = getPrimitive('number')
    const intPrim = numPrim.props.get('int')
    expect(intPrim).toBeDefined()
    const int8 = intPrim!.props?.get('int8') as SemanticPrimitiveNode | undefined
    expect(int8).toBeDefined()
    expect(int8!.annotations).toContainEqual(
      expect.objectContaining({ name: 'expect.min' })
    )
    expect(int8!.annotations).toContainEqual(
      expect.objectContaining({ name: 'expect.max' })
    )
    expect(int8!.config.tags).toContain('int8')
  })

  it('number.int.uint8 should exist with 0-255 range', () => {
    const numPrim = getPrimitive('number')
    const intPrim = numPrim.props.get('int')
    const uint8 = intPrim!.props?.get('uint8') as SemanticPrimitiveNode | undefined
    expect(uint8).toBeDefined()
    expect(uint8!.config.tags).toContain('uint8')
  })

  it('number.int.uint8.byte should exist', () => {
    const numPrim = getPrimitive('number')
    const intPrim = numPrim.props.get('int')
    const uint8 = intPrim!.props?.get('uint8') as SemanticPrimitiveNode | undefined
    expect(uint8).toBeDefined()
    const byte = uint8!.props?.get('byte') as SemanticPrimitiveNode | undefined
    expect(byte).toBeDefined()
    expect(byte!.config.tags).toContain('byte')
  })

  it('number.int.uint16.port should exist', () => {
    const numPrim = getPrimitive('number')
    const intPrim = numPrim.props.get('int')
    const uint16 = intPrim!.props?.get('uint16') as SemanticPrimitiveNode | undefined
    expect(uint16).toBeDefined()
    const port = uint16!.props?.get('port') as SemanticPrimitiveNode | undefined
    expect(port).toBeDefined()
    expect(port!.config.tags).toContain('port')
  })

  it('number.int.int64 should use JS safe integer bounds', () => {
    const numPrim = getPrimitive('number')
    const intPrim = numPrim.props.get('int')
    const int64 = intPrim!.props?.get('int64') as SemanticPrimitiveNode | undefined
    expect(int64).toBeDefined()
    expect(int64!.config.tags).toContain('int64')
    // Verify the annotations contain safe integer bounds
    const minAnno = int64!.annotations?.find(a => a.name === 'expect.min')
    const maxAnno = int64!.annotations?.find(a => a.name === 'expect.max')
    expect(minAnno).toBeDefined()
    expect(maxAnno).toBeDefined()
  })

  it('all 8 sized integer types should exist', () => {
    const numPrim = getPrimitive('number')
    const intPrim = numPrim.props.get('int')
    expect(intPrim).toBeDefined()
    for (const name of ['int8', 'int16', 'int32', 'int64', 'uint8', 'uint16', 'uint32', 'uint64']) {
      const prim = intPrim!.props?.get(name)
      expect(prim, `${name} should exist`).toBeDefined()
    }
  })
})

describe('string extensions', () => {
  it('string.url should exist with pattern annotation', () => {
    const strPrim = getPrimitive('string')
    const url = strPrim.props.get('url')
    expect(url).toBeDefined()
    expect(url!.annotations).toContainEqual(
      expect.objectContaining({ name: 'expect.pattern' })
    )
  })

  it('string.ipv4 should exist with pattern annotation', () => {
    const strPrim = getPrimitive('string')
    const ipv4 = strPrim.props.get('ipv4')
    expect(ipv4).toBeDefined()
    expect(ipv4!.annotations).toContainEqual(
      expect.objectContaining({ name: 'expect.pattern' })
    )
  })

  it('string.ipv6 should exist with pattern annotation', () => {
    const strPrim = getPrimitive('string')
    const ipv6 = strPrim.props.get('ipv6')
    expect(ipv6).toBeDefined()
    expect(ipv6!.annotations).toContainEqual(
      expect.objectContaining({ name: 'expect.pattern' })
    )
  })

  it('string.ip should exist with multiple patterns (ipv4 + ipv6)', () => {
    const strPrim = getPrimitive('string')
    const ip = strPrim.props.get('ip')
    expect(ip).toBeDefined()
    // ip uses array of patterns — should have expect.pattern annotations
    const patternAnnos = ip!.annotations?.filter(a => a.name === 'expect.pattern')
    expect(patternAnnos!.length).toBeGreaterThan(0)
  })

  it('string.char should have minLength=1 and maxLength=1', () => {
    const strPrim = getPrimitive('string')
    const char = strPrim.props.get('char')
    expect(char).toBeDefined()
    expect(char!.annotations).toContainEqual(
      expect.objectContaining({ name: 'expect.minLength' })
    )
    expect(char!.annotations).toContainEqual(
      expect.objectContaining({ name: 'expect.maxLength' })
    )
  })
})

describe('number.timestamp.created', () => {
  it('should have @db.default.now annotation (not db.default.fn)', () => {
    const numPrim = getPrimitive('number')
    const timestamp = numPrim.props.get('timestamp')
    expect(timestamp).toBeDefined()
    const created = timestamp!.props?.get('created') as SemanticPrimitiveNode | undefined
    expect(created).toBeDefined()
    expect(created!.annotations).toContainEqual(
      expect.objectContaining({ name: 'db.default.now' })
    )
    // Should NOT have old db.default.fn
    const fnAnno = created!.annotations?.find(a => a.name === 'db.default.fn')
    expect(fnAnno).toBeUndefined()
  })
})
