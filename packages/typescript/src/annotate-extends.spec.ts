import path from 'path'

import { beforeAll, describe, expect, it } from 'vitest'

import { prepareFixtures } from './test-utils'

const fixturesDir = path.join(path.dirname(import.meta.url.slice(7)), '../test/fixtures')

describe('annotate-block annotations on inherited props', () => {
  beforeAll(() =>
    prepareFixtures({
      rootDir: fixturesDir,
      entries: ['annotate-extends-base.as', 'annotate-extends-child.as'],
    })
  )

  it("carries annotate-block @meta.id onto the child's inherited prop at runtime", async () => {
    const child = (await import('../test/fixtures/annotate-extends-child.as.js')) as {
      AnnotateExtendsChild: {
        type: { props: Map<string, { metadata: Map<string, unknown> }> }
      }
    }
    const base = (await import('../test/fixtures/annotate-extends-base.as.js')) as {
      AnnotateExtendsBase: {
        type: { props: Map<string, { metadata: Map<string, unknown> }> }
      }
    }
    const childUsername = child.AnnotateExtendsChild.type.props.get('username')!
    expect(childUsername.metadata.get('meta.id')).toBe(true)
    // The parent's own prop also receives the runtime mutation (existing behavior)
    const parentUsername = base.AnnotateExtendsBase.type.props.get('username')!
    expect(parentUsername.metadata.get('meta.id')).toBe(true)
  })
})
