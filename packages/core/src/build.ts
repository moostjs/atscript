import path from 'path'
import { glob } from 'glob' // or any other glob library
import { TAtscriptConfigInput, TAtscriptConfigOutput } from './config'
import { AtscriptRepo } from './repo'
import { AtscriptDoc } from './document'
import { TOutputWithSource } from './plugin'
import { TMessages } from './parser/types'
import { mkdir, writeFile } from 'fs/promises'

export interface TOutput extends TOutputWithSource {
  target: string
}

export async function build(config: Partial<TAtscriptConfigInput>) {
  const rootDir = config.rootDir
    ? config.rootDir.startsWith('/')
      ? config.rootDir
      : path.join(process.cwd(), config.rootDir)
    : process.cwd()
  config.rootDir = rootDir

  const repo = new AtscriptRepo(rootDir, config as TAtscriptConfigInput)

  // Gather a list of .as file entries from either user-provided `entries` or by globbing.
  const entries: string[] = []
  if (config.entries && config.entries.length > 0) {
    for (const entry of config.entries) {
      entries.push(path.join(rootDir, entry))
    }
  } else {
    // If no explicit `entries` provided, we look for .as files
    // - default to include all **/*.as if `include` is empty
    // - exclude node_modules by default or use user-provided excludes
    const includes = config.include && config.include.length > 0 ? config.include : ['**/*.as']
    const excludes = config.exclude && config.exclude.length > 0 ? config.exclude : ['node_modules']

    const found = await glob(includes, {
      cwd: rootDir,
      absolute: true,
      ignore: excludes,
    })

    entries.push(...found)
  }

  // Open each document
  const documents: (AtscriptDoc | undefined)[] = []
  for (const entry of entries) {
    documents.push(await repo.openDocument('file://' + entry))
  }

  return new BuildRepo(rootDir, repo, documents.filter(Boolean) as AtscriptDoc[])
}

export class BuildRepo {
  constructor(
    private readonly rootDir: string,
    private readonly repo: AtscriptRepo,
    private readonly docs: AtscriptDoc[]
  ) {}

  async diagnostics() {
    const docMessages = new Map<string, TMessages>()
    for (const document of this.docs) {
      await this.repo.checkDoc(document)
      docMessages.set(document.id, document.getDiagMessages())
    }
    return docMessages
  }

  async generate(config: TAtscriptConfigOutput, docs = this.docs) {
    const outFiles: TOutput[] = []
    // Collect build outputs from each document
    for (const document of docs) {
      const out = await document.render(config.format)
      if (out?.length) {
        outFiles.push(...(out as TOutput[]))
      }
    }

    // Fill `target` for each output file
    for (const outFile of outFiles) {
      // Convert URI-like `id` to a normal file path
      const docPath = outFile.source.replace(/^file:\/\//, '')
      if (config.outDir) {
        const rel = path.relative(this.rootDir, docPath)
        const relDir = path.dirname(rel)
        outFile.target = path.join(this.rootDir, config.outDir, relDir, outFile.fileName)
      } else {
        outFile.target = path.join(path.dirname(docPath), outFile.fileName)
      }
    }

    if (this.repo.sharedConfig && this.docs === docs && this.docs[0]) {
      const { manager } = await this.repo.loadPluginManagerFor(this.docs[0].id)
      await manager.buildEnd(outFiles, config.format, this.repo)
    }

    return outFiles
  }

  async write(config: TAtscriptConfigOutput, docs = this.docs) {
    const outFiles = await this.generate(config, docs)
    for (const o of outFiles) {
      if (o.target) {
        await mkdir(path.dirname(o.target), { recursive: true })
        writeFile(o.target, o.content)
      }
    }
    return outFiles
  }
}
