import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { moduleFile } from './module-file'

describe('moduleFile', () => {
  it('on Windows: the file with `/` (bundler ids), from a path or a document id', () => {
    expect(moduleFile('C:\\app\\src\\my models\\user.as', '\\')).toBe(
      'C:/app/src/my models/user.as'
    )
    expect(moduleFile('C:/app/src/user.as', '\\')).toBe('C:/app/src/user.as')
  })

  it('elsewhere: the decoded path of a document id, a path as it is', () => {
    const file = '/app/src/my models/модели/user.as'
    expect(moduleFile(pathToFileURL(file).href, '/')).toBe(file)
    expect(moduleFile(file, '/')).toBe(file)
  })
})
