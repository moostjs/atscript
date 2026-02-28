import { describe, it, expect } from 'vitest'

import { SemanticPrimitiveNode } from '../nodes'

describe('primitive node', () => {
  it('should create primitive with extensions as props', () => {
    const node = new SemanticPrimitiveNode('string', {
      type: 'string',
      extensions: {
        email: {
          type: 'string',
          annotations: {
            'expect.pattern': {
              pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,4}$',
            },
          },
        },
      },
    })
    expect(node.props.size).toBe(1)
    const email = node.props.get('email')
    expect(email).toBeDefined()
    expect(email?.annotations).toHaveLength(1)
  })
})
