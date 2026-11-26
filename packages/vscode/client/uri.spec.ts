import { pathToFileURL } from 'url'

import { resolveAtscriptFromPath } from '@atscript/core'
import { describe, expect, it } from 'vitest'

import { protocolUri } from './uri'

/** A VS Code `Uri` of a file as the editor writes it (it encodes `@`, `+`, `(`, … too). */
const fileUri = (fsPath: string) => ({
  scheme: 'file',
  fsPath,
  toString: () =>
    `file://${fsPath
      .split('/')
      .map(s => encodeURIComponent(s))
      .join('/')}`,
})

describe('the URIs the client sends the language server', () => {
  const DIRS = [
    '/home/user/project/src',
    '/home/user/my models',
    '/home/user/модели',
    '/repo/node_modules/.pnpm/@atscript+db@0.1.80/node_modules/@atscript/db/models (1)',
  ]

  it('a file: the id the server builds for it from an import', () => {
    for (const dir of DIRS) {
      const a = protocolUri(fileUri(`${dir}/a.as`))
      const b = protocolUri(fileUri(`${dir}/b.as`))

      expect(a).toBe(pathToFileURL(`${dir}/a.as`).href)
      expect(resolveAtscriptFromPath('./b', a)).toBe(b)
    }
  })

  it('any other scheme: as VS Code writes it', () => {
    const uri = { scheme: 'untitled', fsPath: 'Untitled-1', toString: () => 'untitled:Untitled-1' }
    expect(protocolUri(uri)).toBe('untitled:Untitled-1')
  })
})
