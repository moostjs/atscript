import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import path from 'path'
import { pathToFileURL } from 'node:url'

import type { TAtscriptConfig, TAtscriptConfigOutput, TDbConfigDeclarative } from '@atscript/core'
import { isAnnotatedType } from '../annotated-type'
import type { TAtscriptAnnotatedType } from '../annotated-type'
import { build, DEFAULT_FORMAT, loadConfig, resolveConfigFile } from '@atscript/core'
import { Cli, CliOption, CliExample } from '@moostjs/event-cli'
import type { TConsoleBase } from 'moost'
import { Controller, Description, InjectMoostLogger, Optional } from 'moost'

import { tsPlugin } from '../plugin'

@Controller()
export class Commands {
  constructor(@InjectMoostLogger('asc') private readonly logger: TConsoleBase) {}

  @Cli('')
  @Description('Builds .as files using --config and --format')
  @CliExample('-c atscript.config.js', 'Build .as files using atscript.config.js')
  @CliExample('-f dts', 'Build "d.ts" files for ".as" files')
  @CliExample('--noEmit', 'Only check for errors, do not emit files')
  @CliExample('--skipDiag', 'Emit files without running diagnostics')
  async default(
    @CliOption('c', 'config')
    @Optional()
    @Description('Path to config file')
    configFile?: string,

    @CliOption('f', 'format')
    @Optional()
    @Description('Output format (e.g. js, dts). Omit to run all plugins with their default output.')
    format?: string,

    @CliOption('noEmit')
    @Optional()
    @Description('Only run diagnostics without emitting files')
    noEmit?: boolean,

    @CliOption('skipDiag')
    @Optional()
    @Description('Skip diagnostics and always emit files')
    skipDiag?: boolean
  ) {
    const config = await this.getConfig(configFile)
    config.format = format || DEFAULT_FORMAT
    this.logger.log(`Format: ${__DYE_CYAN__}${config.format}${__DYE_COLOR_OFF__}`)
    const builder = await build(config)

    let errorCount = 0
    let warningCount = 0

    if (!skipDiag) {
      const diagMap = await builder.diagnostics()
      for (const [docId, messages] of diagMap) {
        const doc = builder.getDoc(docId)
        for (const m of messages) {
          if (m.severity === 1) {
            errorCount++
          } else if (m.severity === 2) {
            warningCount++
          }
          if (doc) {
            this.logger.log(doc.renderDiagMessage(m, true, true))
          }
        }
      }
    }

    if (!noEmit) {
      const out = await builder.write(config as TAtscriptConfigOutput)
      for (const { target } of out) {
        this.logger.log(`✅ created ${__DYE_GREEN__}${target}${__DYE_COLOR_OFF__}`)
      }
    }

    if (errorCount > 0 || warningCount > 0) {
      const parts = [] as string[]
      if (errorCount > 0) {
        parts.push(
          `${__DYE_RED__}${errorCount} error${errorCount > 1 ? 's' : ''}${__DYE_COLOR_OFF__}`
        )
      }
      if (warningCount > 0) {
        parts.push(
          `${__DYE_YELLOW__}${warningCount} warning${warningCount > 1 ? 's' : ''}${__DYE_COLOR_OFF__}`
        )
      }
      this.logger.log(`\nFound ${parts.join(' and ')}`)
    }

    if (errorCount > 0) {
      process.exit(1)
    }
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

    // 1. Load config
    const config = await this.getConfig(configFile)

    // 2. Validate db config
    if (!config.db) {
      this.logger.error(
        `${__DYE_RED__}No "db" field in atscript config. ` +
        `Add a db configuration to use schema sync.${__DYE_COLOR_OFF__}`
      )
      process.exit(1)
    }

    // 3. Resolve DbSpace
    const dbSpace = await this.resolveDbSpace(config.db)

    // 4. Build .as → .js
    const buildConfig: TAtscriptConfig = { ...config }
    if (typeof config.db === 'object' && 'adapter' in config.db) {
      if (config.db.include) { buildConfig.include = config.db.include }
      if (config.db.exclude) { buildConfig.exclude = config.db.exclude }
    }
    buildConfig.format = 'js'

    this.logger.log(`Compiling .as files...`)
    const builder = await build(buildConfig)
    const outputs = await builder.generate(buildConfig as TAtscriptConfigOutput)

    // 5. Write JS outputs to temp dir with patched imports (.as → .as.mjs)
    const jsOutputs = outputs.filter(o => o.fileName.endsWith('.js'))
    const tmpDir = path.join(process.cwd(), `.atscript-db-sync-${Date.now()}`)
    const patchImports = (content: string) =>
      content.replace(/(from\s+["'][^"']+)\.as(["'])/g, '$1.as.mjs$2')

    const writtenFiles: string[] = []
    for (const o of jsOutputs) {
      const target = path.join(tmpDir, o.fileName.replace(/\.js$/, '.mjs'))
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, patchImports(o.content))
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

    if (dbTypes.length === 0) {
      console.log(`No types with @db.table or @db.view found. Nothing to sync.`)
      return
    }

    console.log(
      `Found ${__DYE_CYAN__}${dbTypes.length}${__DYE_COLOR_OFF__} type(s)`
    )

    console.log(`
${__DYE_CYAN__}     #############
   #################
    %#          #####
                  ####
     ##########   ####   #######
   ############   #### ###########
   ####    ####   #### ####    ###
   ####    ####   #### ######
   ####    ####   ####  #########
   ####    ####   ####      ######
   ####    ####   #### ###     ####
   ############   #### ###########
    ############  ####  #########
            #########
              #####${__DYE_COLOR_OFF__}
`)

    // 6. Run plan
    const { SchemaSync } = await this.importFromCwd('@atscript/utils-db/sync', true) as typeof import('@atscript/utils-db/sync')
    const sync = new SchemaSync(dbSpace)
    const plan = await sync.plan(dbTypes, { force, safe })

    // 7. Display plan
    if (plan.status === 'up-to-date') {
      console.log(`${__DYE_GREEN__}${__DYE_BOLD__}Schema is up to date.${__DYE_BOLD_OFF__}${__DYE_COLOR_OFF__}\n`)
      const tableEntries = plan.tables.filter(t => !t.viewType)
      const viewEntries = plan.tables.filter(t => t.viewType)
      if (tableEntries.length > 0) {
        console.log(`${__DYE_BOLD__}Tables:${__DYE_BOLD_OFF__}`)
        for (const t of tableEntries) {
          console.log(`  ${__DYE_GREEN__}✓${__DYE_COLOR_OFF__} ${__DYE_BOLD__}${t.tableName}${__DYE_BOLD_OFF__} ${__DYE_DIM__}— in sync${__DYE_DIM_OFF__}`)
        }
      }
      if (viewEntries.length > 0) {
        console.log(`${__DYE_BOLD__}Views:${__DYE_BOLD_OFF__}`)
        for (const t of viewEntries) {
          const prefix = `[${t.viewType}]`
          console.log(`  ${__DYE_GREEN__}✓${__DYE_COLOR_OFF__} ${__DYE_BOLD__}${prefix}${t.tableName}${__DYE_BOLD_OFF__} ${__DYE_DIM__}— in sync${__DYE_DIM_OFF__}`)
        }
      }
      console.log('')
      return
    }

    const hasDestructive = plan.tables.some(t =>
      t.columnsToDrop.length > 0 || t.typeChanges.length > 0
    ) || plan.removedTables.length > 0

    const hasChanges = hasDestructive || plan.tables.some(t =>
      t.isNew || t.columnsToAdd.length > 0 || t.columnsToRename.length > 0
    )

    this.displayPlan(plan)

    if (!hasChanges) {
      // Hash mismatch but no actual column changes — just update hash
      if (!dryRun) {
        await sync.run(dbTypes, { force: true, safe })
      }
      return
    }

    // 8. Dry-run exit
    if (dryRun) {
      console.log(`Dry run — no changes applied.`)
      return
    }

    // 9. Confirm if destructive changes, otherwise proceed
    if (hasDestructive) {
      if (!yes) {
        const confirmed = await this.confirm('Apply these changes? (includes destructive operations)')
        if (!confirmed) {
          console.log('Aborted.')
          return
        }
      }
    } else {
      console.log(`\nNo destructive changes, proceeding to sync...\n`)
    }

    // Force=true: plan already validated the hash, skip re-checking
    const result = await sync.run(dbTypes, { force: true, safe })
    this.displayResult(result)
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  async getConfig(configFile?: string): Promise<TAtscriptConfig> {
    const root = process.cwd()
    if (configFile) {
      const c = path.join(root, configFile)
      if (!existsSync(c)) {
        this.logger.error(
          `Config file ${__DYE_UNDERSCORE__}${configFile}${__DYE_UNDERSCORE_OFF__} not found`
        )
        process.exit(1)
      }
      this.logger.log(`Using config file ${__DYE_CYAN__}${configFile}${__DYE_COLOR_OFF__}`)
      return loadConfig(c)
    } else {
      const resolved = await resolveConfigFile(root)
      if (resolved) {
        this.logger.log(`Using config file ${__DYE_CYAN__}${resolved}${__DYE_COLOR_OFF__}`)
        return loadConfig(resolved)
      }
      this.logger.log(`No atscript config file found`)
      return {
        format: DEFAULT_FORMAT,
        plugins: [tsPlugin()],
      }
    }
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

  private displayPlanEntry(log: typeof console.log, table: import('@atscript/utils-db/sync').TSyncPlanTable): void {
    const changes = table.columnsToAdd.length + table.columnsToRename.length +
      table.typeChanges.length + table.columnsToDrop.length

    if (table.isNew) {
      log(`  ${__DYE_GREEN__}+ ${__DYE_BOLD__}${__DYE_UNDERSCORE__}${table.tableName}${__DYE_UNDERSCORE_OFF__}${__DYE_BOLD_OFF__} — create${__DYE_COLOR_OFF__}`)

      for (const col of table.columnsToAdd) {
        log(`      ${__DYE_GREEN__}+ ${col.physicalName} (${col.designType})${col.isPrimaryKey ? ' PK' : ''}${col.optional ? ' nullable' : ''} — add${__DYE_COLOR_OFF__}`)
      }
      log('')
    } else if (changes > 0) {
      log(`  ${__DYE_CYAN__}~ ${__DYE_BOLD__}${__DYE_UNDERSCORE__}${table.tableName}${__DYE_UNDERSCORE_OFF__}${__DYE_BOLD_OFF__} — alter${__DYE_COLOR_OFF__}`)

      for (const col of table.columnsToAdd) {
        log(`      ${__DYE_GREEN__}+ ${col.physicalName} (${col.designType}) — add${__DYE_COLOR_OFF__}`)
      }
      for (const r of table.columnsToRename) {
        log(`      ${__DYE_YELLOW__}~ ${r.from} → ${r.to} — rename${__DYE_COLOR_OFF__}`)
      }
      for (const tc of table.typeChanges) {
        const action = table.syncMethod ? ` — ${table.syncMethod}` : ' — requires migration'
        log(`      ${__DYE_RED__}! ${tc.column}: ${tc.fromType} → ${tc.toType}${action}${__DYE_COLOR_OFF__}`)
      }
      for (const col of table.columnsToDrop) {
        log(`      ${__DYE_RED__}- ${col} — drop${__DYE_COLOR_OFF__}`)
      }
      log('')
    } else {
      const prefix = table.viewType ? `[${table.viewType}]` : ''
      log(`  ${__DYE_GREEN__}✓${__DYE_COLOR_OFF__} ${__DYE_BOLD__}${prefix}${table.tableName}${__DYE_BOLD_OFF__} ${__DYE_DIM__}— in sync${__DYE_DIM_OFF__}`)
    }
  }

  private displayPlan(plan: import('@atscript/utils-db/sync').TSyncPlan): void {
    const log = console.log
    log('')
    log(`${__DYE_BOLD__}╔══════════════════════════════════════╗${__DYE_BOLD_OFF__}`)
    log(`${__DYE_BOLD__}║        Schema Sync Plan              ║${__DYE_BOLD_OFF__}`)
    log(`${__DYE_BOLD__}╚══════════════════════════════════════╝${__DYE_BOLD_OFF__}`)
    log('')

    const tableEntries = plan.tables.filter(t => !t.viewType)
    const viewEntries = plan.tables.filter(t => t.viewType)

    if (tableEntries.length > 0) {
      log(`${__DYE_BOLD__}Tables:${__DYE_BOLD_OFF__}`)
      for (const table of tableEntries) {
        this.displayPlanEntry(log, table)
      }
      for (const t of plan.removedTables) {
        log(`  ${__DYE_RED__}- ${__DYE_BOLD__}${__DYE_UNDERSCORE__}${t}${__DYE_UNDERSCORE_OFF__}${__DYE_BOLD_OFF__} — drop table${__DYE_COLOR_OFF__}`)
      }
    }

    if (viewEntries.length > 0) {
      log(`${__DYE_BOLD__}Views:${__DYE_BOLD_OFF__}`)
      for (const view of viewEntries) {
        this.displayPlanEntry(log, view)
      }
    }

    log('')
  }

  private displayResultEntry(log: typeof console.log, t: import('@atscript/utils-db/sync').TSyncTableResult): void {
    const hasColumnChanges = t.columnsAdded.length > 0 || t.columnsRenamed.length > 0 || t.columnsDropped.length > 0

    if (t.created) {
      log(`  ${__DYE_GREEN__}+ ${__DYE_BOLD__}${__DYE_UNDERSCORE__}${t.tableName}${__DYE_UNDERSCORE_OFF__}${__DYE_BOLD_OFF__} — created${__DYE_COLOR_OFF__}`)
      if (hasColumnChanges) {
        for (const col of t.columnsAdded) {
          log(`      ${__DYE_GREEN__}+ ${col} — added${__DYE_COLOR_OFF__}`)
        }
      }
      log('')
    } else if (hasColumnChanges || t.recreated) {
      if (t.recreated) {
        log(`  ${__DYE_YELLOW__}~ ${__DYE_BOLD__}${__DYE_UNDERSCORE__}${t.tableName}${__DYE_UNDERSCORE_OFF__}${__DYE_BOLD_OFF__} — recreated${__DYE_COLOR_OFF__}`)
      } else {
        log(`  ${__DYE_CYAN__}~ ${__DYE_BOLD__}${__DYE_UNDERSCORE__}${t.tableName}${__DYE_UNDERSCORE_OFF__}${__DYE_BOLD_OFF__} — altered${__DYE_COLOR_OFF__}`)
      }
      for (const col of t.columnsAdded) {
        log(`      ${__DYE_GREEN__}+ ${col} — added${__DYE_COLOR_OFF__}`)
      }
      for (const col of t.columnsRenamed) {
        log(`      ${__DYE_YELLOW__}~ ${col} — renamed${__DYE_COLOR_OFF__}`)
      }
      for (const col of t.columnsDropped) {
        log(`      ${__DYE_RED__}- ${col} — dropped${__DYE_COLOR_OFF__}`)
      }
      log('')
    } else {
      const prefix = t.viewType ? `[${t.viewType}]` : ''
      log(`  ${__DYE_GREEN__}✓${__DYE_COLOR_OFF__} ${__DYE_BOLD__}${prefix}${t.tableName}${__DYE_BOLD_OFF__} ${__DYE_DIM__}— in sync${__DYE_DIM_OFF__}`)
    }

    for (const err of t.errors) {
      log(`    ${__DYE_RED__}Error: ${err}${__DYE_COLOR_OFF__}`)
    }
  }

  private displayResult(result: import('@atscript/utils-db/sync').TSyncResult): void {
    const log = console.log
    log('')
    log(`${__DYE_GREEN__}${__DYE_BOLD__}Schema synced successfully.${__DYE_BOLD_OFF__}${__DYE_COLOR_OFF__} Hash: ${result.schemaHash}`)
    log('')

    if (result.tables) {
      const tableEntries = result.tables.filter(t => !t.viewType)
      const viewEntries = result.tables.filter(t => t.viewType)

      if (tableEntries.length > 0) {
        log(`${__DYE_BOLD__}Tables:${__DYE_BOLD_OFF__}`)
        for (const t of tableEntries) {
          this.displayResultEntry(log, t)
        }
        if (result.removedTables && result.removedTables.length > 0) {
          for (const t of result.removedTables) {
            log(`  ${__DYE_RED__}- ${__DYE_BOLD__}${__DYE_UNDERSCORE__}${t}${__DYE_UNDERSCORE_OFF__}${__DYE_BOLD_OFF__} — dropped${__DYE_COLOR_OFF__}`)
          }
        }
      }

      if (viewEntries.length > 0) {
        log(`${__DYE_BOLD__}Views:${__DYE_BOLD_OFF__}`)
        for (const t of viewEntries) {
          this.displayResultEntry(log, t)
        }
      }
    }

    log('')
  }

  private async importFromCwd(specifier: string, preferEsm = false): Promise<any> {
    const require = createRequire(path.join(process.cwd(), '__synthetic.cjs'))
    let resolved = require.resolve(specifier)
    if (preferEsm) {
      // Prefer .mjs to avoid CJS chunk issues in bundled packages
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
