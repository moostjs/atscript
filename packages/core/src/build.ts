import path from 'path'
import { glob } from 'glob' // or any other glob library
import { TAnscriptConfigInput } from './config'
import { AnscriptRepo } from './repo'
import { AnscriptDoc } from './document'
import { TOutputExtended } from './plugin'
import { TMessages } from './parser/types'

export async function build(config: TAnscriptConfigInput) {
  const rootDir = config.rootDir ? path.join(process.cwd(), config.rootDir) : process.cwd()
  config.rootDir = rootDir

  const repo = new AnscriptRepo(rootDir, config)

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
  const documents: (AnscriptDoc | undefined)[] = []
  for (const entry of entries) {
    documents.push(await repo.openDocument('file://' + entry))
  }

  return new BuildRepo(rootDir, repo, documents.filter(Boolean) as AnscriptDoc[])
}

export class BuildRepo {
  constructor(
    private readonly rootDir: string,
    private readonly repo: AnscriptRepo,
    private readonly docs: AnscriptDoc[]
  ) {}

  async diagnostics() {
    const docMessages = new Map<string, TMessages>()
    for (const document of this.docs) {
      await this.repo.checkDoc(document)
      docMessages.set(document.id, document.getDiagMessages())
    }
    return docMessages
  }

  async generate(config: { outDir?: string }) {
    const outFiles: TOutputExtended[] = []

    // Collect build outputs from each document
    for (const document of this.docs) {
      const out = await document.render({ action: 'build' })
      if (out?.length) {
        outFiles.push(...out)
      }
    }

    // Fill `target` for each output file
    for (const outFile of outFiles) {
      // Convert URI-like `id` to a normal file path
      const docPath = outFile.id.replace(/^file:\/\//, '')
      if (config.outDir) {
        const rel = path.relative(this.rootDir, docPath)
        const relDir = path.dirname(rel)
        outFile.target = path.join(this.rootDir, config.outDir, relDir, outFile.name)
      } else {
        outFile.target = path.join(path.dirname(docPath), outFile.name)
      }
    }

    return outFiles
  }
}
