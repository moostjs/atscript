import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import type { TAtscriptPlugin } from '@atscript/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prepareFixtures } from '../test-utils'

const SOURCE_A = `export interface FixtureA {\n    id: string\n}\n`
const SOURCE_B = `export interface FixtureB {\n    id: string\n    name: string\n}\n`

function writeFixture(dir: string, name: string, content: string) {
  writeFileSync(path.join(dir, name), content)
}

describe('prepareFixtures', () => {
  let rootDir: string

  beforeAll(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), 'atscript-test-utils-'))
    writeFixture(rootDir, 'a.as', SOURCE_A)
    writeFixture(rootDir, 'b.as', SOURCE_B)
  })

  afterAll(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  it('rootDir only — produces js and dts for every discovered fixture', async () => {
    await prepareFixtures({ rootDir })
    for (const base of ['a.as', 'b.as']) {
      expect(existsSync(path.join(rootDir, `${base}.js`))).toBe(true)
      expect(existsSync(path.join(rootDir, `${base}.d.ts`))).toBe(true)
    }
  })

  it('entries narrows the generated set vs include default', async () => {
    const scoped = mkdtempSync(path.join(tmpdir(), 'atscript-test-utils-entries-'))
    writeFixture(scoped, 'only.as', SOURCE_A)
    writeFixture(scoped, 'other.as', SOURCE_B)

    await prepareFixtures({ rootDir: scoped, entries: ['only.as'] })

    expect(existsSync(path.join(scoped, 'only.as.js'))).toBe(true)
    expect(existsSync(path.join(scoped, 'only.as.d.ts'))).toBe(true)
    expect(existsSync(path.join(scoped, 'other.as.js'))).toBe(false)
    expect(existsSync(path.join(scoped, 'other.as.d.ts'))).toBe(false)

    rmSync(scoped, { recursive: true, force: true })
  })

  it("formats: ['dts'] suppresses js output", async () => {
    const scoped = mkdtempSync(path.join(tmpdir(), 'atscript-test-utils-dts-'))
    writeFixture(scoped, 'c.as', SOURCE_A)

    await prepareFixtures({ rootDir: scoped, formats: ['dts'] })

    expect(existsSync(path.join(scoped, 'c.as.d.ts'))).toBe(true)
    expect(existsSync(path.join(scoped, 'c.as.js'))).toBe(false)

    rmSync(scoped, { recursive: true, force: true })
  })

  it('caller-supplied plugins reach build() alongside the auto-injected tsPlugin', async () => {
    const scoped = mkdtempSync(path.join(tmpdir(), 'atscript-test-utils-plugins-'))
    writeFixture(scoped, 'p.as', SOURCE_A)

    const seenPluginNames: string[] = []
    const spyPlugin: TAtscriptPlugin = {
      name: 'spy-plugin',
      config(cfg) {
        seenPluginNames.push(...(cfg.plugins ?? []).map(p => p.name))
        return cfg
      },
    }

    await prepareFixtures({ rootDir: scoped, plugins: [spyPlugin] })

    expect(seenPluginNames).toContain('typescript')
    expect(seenPluginNames).toContain('spy-plugin')

    rmSync(scoped, { recursive: true, force: true })
  })

  it('writes unconditionally — rewrites identical content and bumps mtime', async () => {
    const scoped = mkdtempSync(path.join(tmpdir(), 'atscript-test-utils-mtime-'))
    writeFixture(scoped, 'm.as', SOURCE_A)

    await prepareFixtures({ rootDir: scoped })
    const targetJs = path.join(scoped, 'm.as.js')
    const firstContent = readFileSync(targetJs, 'utf8')
    const firstMtime = statSync(targetJs).mtimeMs

    // ensure the clock advances across platforms
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })

    await prepareFixtures({ rootDir: scoped })
    const secondContent = readFileSync(targetJs, 'utf8')
    const secondMtime = statSync(targetJs).mtimeMs

    expect(secondContent).toBe(firstContent)
    expect(secondMtime).toBeGreaterThan(firstMtime)

    rmSync(scoped, { recursive: true, force: true })
  })

  it('lands files at path.join(rootDir, fileName) colocated with each source', async () => {
    const scoped = mkdtempSync(path.join(tmpdir(), 'atscript-test-utils-target-'))
    writeFixture(scoped, 'x.as', SOURCE_A)

    await prepareFixtures({ rootDir: scoped })

    expect(existsSync(path.join(scoped, 'x.as.js'))).toBe(true)
    expect(existsSync(path.join(scoped, 'x.as.d.ts'))).toBe(true)

    rmSync(scoped, { recursive: true, force: true })
  })
})
