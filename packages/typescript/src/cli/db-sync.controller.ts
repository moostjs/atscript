// oxlint-disable max-params
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import path from 'path'
import { pathToFileURL } from 'node:url'

import type { TAtscriptConfig, TAtscriptConfigOutput, TDbConfigDeclarative } from '@atscript/core'
import { build } from '@atscript/core'
import { Cli, CliOption, CliExample } from '@moostjs/event-cli'
import type { TConsoleBase } from 'moost'
import { Controller, Description, InjectMoostLogger, Optional } from 'moost'

import { isAnnotatedType } from '../runtime/annotated-type'
import type { TAtscriptAnnotatedType } from '../runtime/annotated-type'
import { getConfig } from './config'
import { DbSyncPrinter } from './db-sync-printer'

@Controller()
export class DbSyncController {
  private readonly printer: DbSyncPrinter

  constructor(
    @InjectMoostLogger('asc') private readonly logger: TConsoleBase,
  ) {
    this.printer = new DbSyncPrinter()
  }

  @Cli('db sync')
  @Description('Synchronize database schema with .as type definitions')
  @CliExample('db sync', 'Interactive sync — shows plan, prompts, then applies')
  @CliExample('db sync --dry-run', 'Show what would change without applying')
  @CliExample('db sync --yes', 'Skip confirmation prompt (CI mode)')
  @CliExample('db sync --force', 'Re-sync even if schema hash matches')
  @CliExample('db sync --safe', 'Skip destructive operations (column/table drops)')
  async dbSync(
    @CliOption('c', 'config')
    @Optional()
    @Description('Path to config file')
    configFile?: string,

    @CliOption('dry-run')
    @Optional()
    @Description('Show plan only, do not apply changes')
    dryRun?: boolean,

    @CliOption('yes')
    @Optional()
    @Description('Skip confirmation prompt (CI mode)')
    yes?: boolean,

    @CliOption('force')
    @Optional()
    @Description('Ignore schema hash, re-sync even if up-to-date')
    force?: boolean,

    @CliOption('safe')
    @Optional()
    @Description('Skip destructive operations (column/table drops)')
    safe?: boolean,
  ) {
    const config = await getConfig(configFile, this.logger)

    if (!config.db) {
      this.logger.error(
        `${__DYE_RED__}No "db" field in atscript config. ` +
        `Add a db configuration to use schema sync.${__DYE_COLOR_OFF__}`
      )
      process.exit(1)
    }

    const [dbSpace, dbTypes] = await Promise.all([
      this.resolveDbSpace(config.db),
      this.compileAndLoadTypes(config),
    ])

    if (dbTypes.length === 0) {
      this.logger.log(`No types with @db.table or @db.view found. Nothing to sync.`)
      return
    }

    this.printer.typeCount(dbTypes.length)
    this.printer.banner()

    const { SchemaSync } = await this.importFromCwd('@atscript/utils-db/sync', true) as typeof import('@atscript/utils-db/sync')
    const sync = new SchemaSync(dbSpace)
    const plan = await sync.plan(dbTypes, { force, safe })

    if (plan.status === 'up-to-date') {
      this.printer.planUpToDate(plan)
      return
    }

    const hasDestructive = plan.entries.some(e => e.destructive)
    const hasChanges = plan.entries.some(e => e.hasChanges)
    const hasErrors = plan.entries.some(e => e.hasErrors)

    this.printer.plan(plan)

    if (hasErrors) {
      this.logger.error(`Schema has errors. Fix the issues above before syncing.`)
      process.exit(1)
    }

    if (!hasChanges) {
      if (!dryRun) {
        await sync.run(dbTypes, { force: true, safe })
      }
      return
    }

    if (dryRun) {
      this.logger.log(`Dry run — no changes applied.`)
      return
    }

    if (hasDestructive) {
      if (!yes) {
        const confirmed = await this.confirm('Apply these changes? (includes destructive operations)')
        if (!confirmed) {
          this.logger.log('Aborted.')
          return
        }
      }
    } else {
      this.logger.log(`No destructive changes, proceeding to sync...`)
    }

    const result = await sync.run(dbTypes, { force: true, safe })
    this.printer.result(result)
  }

  // ── Private helpers ────────────────────────────────────────────────

  private async compileAndLoadTypes(config: TAtscriptConfig): Promise<TAtscriptAnnotatedType[]> {
    const buildConfig: TAtscriptConfig = { ...config }
    if (typeof config.db === 'object' && 'adapter' in config.db) {
      const dbConfig = config.db as TDbConfigDeclarative
      if (dbConfig.include) { buildConfig.include = dbConfig.include }
      if (dbConfig.exclude) { buildConfig.exclude = dbConfig.exclude }
    }
    buildConfig.format = 'js'

    this.logger.log(`Compiling .as files...`)
    const builder = await build(buildConfig)
    const outputs = await builder.generate(buildConfig as TAtscriptConfigOutput)

    const jsOutputs = outputs.filter(o => o.fileName.endsWith('.js'))
    const tmpDir = path.join(process.cwd(), `.atscript-db-sync-${Date.now()}`)

    const writtenFiles: string[] = []
    for (const o of jsOutputs) {
      const target = path.join(tmpDir, o.fileName.replace(/\.js$/, '.mjs'))
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, patchAsImports(o.content))
      writtenFiles.push(target)
    }

    const dbTypes: TAtscriptAnnotatedType[] = []
    try {
      for (const file of writtenFiles) {
        const mod = await import(/* @vite-ignore */ pathToFileURL(file).href)
        for (const exp of Object.values(mod)) {
          if (isAnnotatedType(exp) && (exp.metadata?.has('db.table') || exp.metadata?.has('db.view'))) {
            dbTypes.push(exp)
          }
        }
      }
    } catch (error) {
      this.logger.warn?.(`Could not import compiled types: ${error}`)
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }

    return dbTypes
  }

  private async resolveDbSpace(dbConfig: NonNullable<TAtscriptConfig['db']>): Promise<any> {
    if (typeof dbConfig === 'function') {
      this.logger.log(`Resolving database space from callback...`)
      return await dbConfig()
    }

    const { adapter, connection, options } = dbConfig as TDbConfigDeclarative
    this.logger.log(`Using adapter: ${__DYE_CYAN__}${adapter}${__DYE_COLOR_OFF__}`)

    let mod: any
    try {
      mod = await this.importFromCwd(adapter)
    } catch {
      this.logger.error(
        `${__DYE_RED__}Could not import adapter package "${adapter}". Is it installed?${__DYE_COLOR_OFF__}`
      )
      process.exit(1)
    }

    if (typeof mod.createAdapter !== 'function') {
      this.logger.error(
        `${__DYE_RED__}Adapter package "${adapter}" does not export a createAdapter function.${__DYE_COLOR_OFF__}`
      )
      process.exit(1)
    }

    const resolvedConnection = typeof connection === 'function' ? await connection() : connection
    return mod.createAdapter(resolvedConnection, options)
  }

  private async importFromCwd(specifier: string, preferEsm = false): Promise<any> {
    const require = createRequire(path.join(process.cwd(), '__synthetic.cjs'))
    let resolved = require.resolve(specifier)
    if (preferEsm) {
      const mjsPath = resolved.replace(/\.cjs$/, '.mjs')
      if (existsSync(mjsPath)) { resolved = mjsPath }
    }
    return import(/* @vite-ignore */ pathToFileURL(resolved).href)
  }

  private async confirm(message: string): Promise<boolean> {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    return new Promise(resolve => {
      rl.question(`${message} [y/N] `, answer => {
        rl.close()
        resolve(answer.trim().toLowerCase() === 'y')
      })
    })
  }
}

function patchAsImports(content: string): string {
  return content.replace(/(from\s+["'][^"']+)\.as(["'])/g, '$1.as.mjs$2')
}
