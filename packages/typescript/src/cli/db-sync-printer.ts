import type { TSyncPlan, TSyncResult, TSyncColors, SyncEntry } from '@atscript/db/sync'

// ── Dye colors ──────────────────────────────────────────────────────

const DYE_COLORS: TSyncColors = {
  green: s => `${__DYE_GREEN__}${s}${__DYE_COLOR_OFF__}`,
  red: s => `${__DYE_RED__}${s}${__DYE_COLOR_OFF__}`,
  cyan: s => `${__DYE_CYAN__}${s}${__DYE_COLOR_OFF__}`,
  yellow: s => `${__DYE_YELLOW__}${s}${__DYE_COLOR_OFF__}`,
  bold: s => `${__DYE_BOLD__}${s}${__DYE_BOLD_OFF__}`,
  dim: s => `${__DYE_DIM__}${s}${__DYE_DIM_OFF__}`,
  underline: s => `${__DYE_UNDERSCORE__}${s}${__DYE_UNDERSCORE_OFF__}`,
}

const BANNER = DYE_COLORS.cyan(`

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
  DYE_COLORS.bold('╔══════════════════════════════════════╗'),
  DYE_COLORS.bold('║           Schema Sync Plan           ║'),
  DYE_COLORS.bold('╚══════════════════════════════════════╝'),
  '',
]

// ── Printer ──────────────────────────────────────────────────────────

/** Plan-level aggregates over the per-entry SyncEntry getters. */
export function planFlags(plan: TSyncPlan): {
  destructive: boolean
  hasChanges: boolean
  hasErrors: boolean
} {
  return {
    destructive: plan.entries.some(e => e.destructive),
    hasChanges: plan.entries.some(e => e.hasChanges),
    hasErrors: plan.entries.some(e => e.hasErrors),
  }
}

export class DbSyncPrinter {
  private readonly colors = DYE_COLORS

  /** When true, all pretty-print output is suppressed (structured stdout mode). */
  muted = false

  private log(...args: unknown[]) {
    if (!this.muted) {
      console.log(...args) // oxlint-ignore-line no-console
    }
  }

  banner() {
    this.log(BANNER)
  }

  typeCount(count: number) {
    this.log(`Found ${this.colors.cyan(String(count))} type(s)`)
  }

  planUpToDate(plan: TSyncPlan) {
    this.log(`${this.colors.green(this.colors.bold('Schema is up to date.'))}\n`)
    this.printGrouped(plan.entries, 'plan')
    this.log('')
  }

  plan(plan: TSyncPlan) {
    for (const line of PLAN_HEADER) {
      this.log(line)
    }
    this.printGrouped(plan.entries, 'plan')
    this.log('')
  }

  result(result: TSyncResult) {
    this.log('')
    this.log(
      `${this.colors.green(this.colors.bold('Schema synced successfully.'))} Hash: ${result.schemaHash}`
    )
    this.log('')
    this.printGrouped(result.entries, 'result')
    this.log('')
  }

  // ── Structured output (--format json|markdown) ───────────────────

  /** Renders the plan as a JSON document for CI consumption. */
  renderJson(plan: TSyncPlan): string {
    const doc = {
      status: plan.status,
      schemaHash: plan.schemaHash,
      ...planFlags(plan),
      entries: plan.entries.map(e => ({
        name: e.name,
        kind: e.viewType ? 'view' : 'table',
        viewType: e.viewType,
        status: e.status,
        destructive: e.destructive,
        syncMethod: e.syncMethod,
        renamedFrom: e.renamedFrom,
        columnsToAdd: e.columnsToAdd.map(c => ({
          path: c.path,
          physicalName: c.physicalName,
          designType: c.designType,
          optional: c.optional,
          isPrimaryKey: c.isPrimaryKey,
          storage: c.storage,
        })),
        columnsToRename: e.columnsToRename,
        typeChanges: e.typeChanges,
        nullableChanges: e.nullableChanges,
        defaultChanges: e.defaultChanges,
        columnsToDrop: e.columnsToDrop,
        optionChanges: e.optionChanges,
        fkAdded: e.fkAdded,
        fkRemoved: e.fkRemoved,
        fkChanged: e.fkChanged,
        errors: e.errors,
      })),
    }
    return `${JSON.stringify(doc, undefined, 2)}\n`
  }

  /** Renders the plan as a Markdown document (e.g. for PR comments). */
  renderMarkdown(plan: TSyncPlan): string {
    const { destructive } = planFlags(plan)
    const lines: string[] = [
      '# Schema Sync Plan',
      '',
      `- **Status:** ${plan.status}${destructive ? ' (destructive)' : ''}`,
      `- **Schema hash:** \`${plan.schemaHash}\``,
      '',
    ]
    const tables = plan.entries.filter(e => !e.viewType)
    const views = plan.entries.filter(e => e.viewType)
    for (const [title, entries] of [
      ['Tables', tables],
      ['Views', views],
    ] as const) {
      if (entries.length === 0) {
        continue
      }
      lines.push(`## ${title}`, '', '```')
      for (const e of entries) {
        // print() without colors falls back to its internal no-op palette
        for (const line of e.print('plan')) {
          lines.push(line)
        }
      }
      lines.push('```', '')
    }
    return `${lines.join('\n')}\n`
  }

  // ── Private helpers ──────────────────────────────────────────────

  private printGrouped(entries: SyncEntry[], mode: 'plan' | 'result') {
    const tables = entries.filter(e => !e.viewType)
    const views = entries.filter(e => e.viewType)

    if (tables.length > 0) {
      this.log(this.colors.bold('Tables:'))
      for (const e of tables) {
        for (const line of e.print(mode, this.colors)) {
          this.log(line)
        }
      }
    }

    if (views.length > 0) {
      if (tables.length > 0) {
        this.log('')
      }
      this.log(this.colors.bold('Views:'))
      for (const e of views) {
        for (const line of e.print(mode, this.colors)) {
          this.log(line)
        }
      }
    }
  }
}
