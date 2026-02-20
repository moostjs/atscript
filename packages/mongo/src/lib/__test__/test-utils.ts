import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

import { build } from '@atscript/core'
import ts from '@atscript/typescript'

import { MongoPlugin } from '../../plugin/index'

export async function prepareFixtures() {
  const wd = path.join(path.dirname(import.meta.url.slice(7)), 'fixtures')
  const repo = await build({
    rootDir: wd,
    include: ['**/*.as'],
    plugins: [ts(), MongoPlugin()],
  })
  const out = await repo.generate({
    outDir: '.',
    format: 'js',
  })
  const outDts = await repo.generate({
    outDir: '.',
    format: 'dts',
  })
  for (const file of [...out, ...outDts]) {
    if (existsSync(file.target)) {
      const content = readFileSync(file.target).toString()
      if (content !== file.content) {
        writeFileSync(file.target, file.content)
      }
    } else {
      writeFileSync(file.target, file.content)
    }
  }
}
