import type { TSyncPlan, TSyncPlanTable, TSyncResult, TSyncTableResult } from '@atscript/utils-db/sync'

// ── Formatting helpers ───────────────────────────────────────────────

const green = (s: string) => `${__DYE_GREEN__}${s}${__DYE_COLOR_OFF__}`
const red = (s: string) => `${__DYE_RED__}${s}${__DYE_COLOR_OFF__}`
const cyan = (s: string) => `${__DYE_CYAN__}${s}${__DYE_COLOR_OFF__}`
const yellow = (s: string) => `${__DYE_YELLOW__}${s}${__DYE_COLOR_OFF__}`
const bold = (s: string) => `${__DYE_BOLD__}${s}${__DYE_BOLD_OFF__}`
const dim = (s: string) => `${__DYE_DIM__}${s}${__DYE_DIM_OFF__}`
const underline = (s: string) => `${__DYE_UNDERSCORE__}${s}${__DYE_UNDERSCORE_OFF__}`

const tableName = (name: string) => bold(underline(name))
const inSync = (name: string, prefix = '') =>
  `  ${green('✓')} ${prefix ? `${dim(prefix)} ` : ''}${bold(name)} ${dim('— in sync')}`

const BANNER = cyan(`

     #############
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
              #####
              
`)

const PLAN_HEADER = [
  '',
  bold('╔══════════════════════════════════════╗'),
  bold('║        Schema Sync Plan              ║'),
  bold('╚══════════════════════════════════════╝'),
  '',
]

// ── Printer ──────────────────────────────────────────────────────────

export class DbSyncPrinter {
  private log(...args: unknown[]) {
    console.log(...args) // oxlint-ignore-line no-console
  }

  banner() {
    this.log(BANNER)
  }

  typeCount(count: number) {
    this.log(`Found ${cyan(String(count))} type(s)`)
  }

  // ── Plan display ─────────────────────────────────────────────────

  planUpToDate(plan: TSyncPlan) {
    this.log(`${green(bold('Schema is up to date.'))}\n`)
    this.printGrouped(plan.tables, t => inSync(t.tableName, t.viewType ? `[${t.viewType}]` : ''))
    this.log('')
  }

  plan(plan: TSyncPlan) {
    for (const line of PLAN_HEADER) { this.log(line) }
    this.printGrouped(plan.tables, t => this.formatPlanEntry(t), plan.removedTables, plan.removedViews)
    this.log('')
  }

  // ── Result display ───────────────────────────────────────────────

  result(result: TSyncResult) {
    this.log('')
    this.log(`${green(bold('Schema synced successfully.'))} Hash: ${result.schemaHash}`)
    this.log('')

    if (result.tables) {
      this.printGrouped(result.tables, t => this.formatResultEntry(t), result.removedTables, result.removedViews)
    }

    this.log('')
  }

  // ── Private helpers ──────────────────────────────────────────────

  private printGrouped<T extends { viewType?: string; tableName: string }>(
    items: T[],
    format: (item: T) => string | string[],
    removedTables?: string[],
    removedViews?: string[],
  ) {
    const tables = items.filter(t => !t.viewType)
    const views = items.filter(t => t.viewType)

    if (tables.length > 0 || (removedTables && removedTables.length > 0)) {
      this.log(bold('Tables:'))
      for (const t of tables) { this.printLines(format(t)) }
      if (removedTables) {
        for (const name of removedTables) {
          this.log(`  ${red(`- ${tableName(name)} — drop table`)}`)
        }
      }
    }

    if (views.length > 0 || (removedViews && removedViews.length > 0)) {
      if (tables.length > 0 || (removedTables && removedTables.length > 0)) { this.log('') }
      this.log(bold('Views:'))
      for (const v of views) { this.printLines(format(v)) }
      if (removedViews) {
        for (const name of removedViews) {
          this.log(`  ${red(`- ${tableName(name)} — drop view`)}`)
        }
      }
    }
  }

  private printLines(lines: string | string[]) {
    if (Array.isArray(lines)) {
      for (const l of lines) { this.log(l) }
    } else {
      this.log(lines)
    }
  }

  private formatPlanEntry(t: TSyncPlanTable): string | string[] {
    const changes = t.columnsToAdd.length + t.columnsToRename.length +
      t.typeChanges.length + t.columnsToDrop.length

    const viewPrefix = t.viewType ? `${dim(`[${t.viewType}]`)} ` : ''

    if (t.isNew) {
      const lines = [
        `  ${green(`+ ${viewPrefix}${tableName(t.tableName)} — create`)}`,
        ...t.columnsToAdd.map(col =>
          `      ${green(`+ ${col.physicalName} (${col.designType})${col.isPrimaryKey ? ' PK' : ''}${col.optional ? ' nullable' : ''} — add`)}`
        ),
        '',
      ]
      return lines
    }

    if (changes > 0) {
      const lines = [
        `  ${cyan(`~ ${viewPrefix}${tableName(t.tableName)} — alter`)}`,
        ...t.columnsToAdd.map(col =>
          `      ${green(`+ ${col.physicalName} (${col.designType}) — add`)}`
        ),
        ...t.columnsToRename.map(r =>
          `      ${yellow(`~ ${r.from} → ${r.to} — rename`)}`
        ),
        ...t.typeChanges.map(tc => {
          const action = t.syncMethod ? ` — ${t.syncMethod}` : ' — requires migration'
          return `      ${red(`! ${tc.column}: ${tc.fromType} → ${tc.toType}${action}`)}`
        }),
        ...t.columnsToDrop.map(col =>
          `      ${red(`- ${col} — drop`)}`
        ),
        '',
      ]
      return lines
    }

    return inSync(t.tableName, t.viewType ? `[${t.viewType}]` : '')
  }

  private formatResultEntry(t: TSyncTableResult): string | string[] {
    const hasColumnChanges = t.columnsAdded.length > 0 || t.columnsRenamed.length > 0 || t.columnsDropped.length > 0
    const viewPrefix = t.viewType ? `${dim(`[${t.viewType}]`)} ` : ''

    if (t.created) {
      const lines = [
        `  ${green(`+ ${viewPrefix}${tableName(t.tableName)} — created`)}`,
        ...t.columnsAdded.map(col => `      ${green(`+ ${col} — added`)}`),
        '',
      ]
      return lines
    }

    if (hasColumnChanges || t.recreated) {
      const label = t.recreated ? 'recreated' : 'altered'
      const color = t.recreated ? yellow : cyan
      const lines = [
        `  ${color(`~ ${viewPrefix}${tableName(t.tableName)} — ${label}`)}`,
        ...t.columnsAdded.map(col => `      ${green(`+ ${col} — added`)}`),
        ...t.columnsRenamed.map(col => `      ${yellow(`~ ${col} — renamed`)}`),
        ...t.columnsDropped.map(col => `      ${red(`- ${col} — dropped`)}`),
        '',
      ]
      return lines
    }

    const result = inSync(t.tableName, t.viewType ? `[${t.viewType}]` : '')

    if (t.errors.length > 0) {
      return [result, ...t.errors.map(err => `    ${red(`Error: ${err}`)}`)]
    }

    return result
  }
}
