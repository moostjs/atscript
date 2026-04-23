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

export class DbSyncPrinter {
  private readonly colors = DYE_COLORS

  private log(...args: unknown[]) {
    console.log(...args) // oxlint-ignore-line no-console
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
