import type { TMysqlConnection, TMysqlDriver, TMysqlRunResult } from './types'

/**
 * {@link TMysqlDriver} implementation backed by `mysql2/promise`.
 *
 * Accepts a connection URI string, a `PoolOptions` object, or a pre-created
 * `Pool` instance from `mysql2/promise`.
 *
 * ```typescript
 * import { Mysql2Driver } from '@atscript/db-mysql'
 *
 * // Connection URI
 * const driver = new Mysql2Driver('mysql://root:pass@localhost:3306/mydb')
 *
 * // Pool options
 * const driver = new Mysql2Driver({
 *   host: 'localhost',
 *   user: 'root',
 *   database: 'mydb',
 *   waitForConnections: true,
 *   connectionLimit: 10,
 * })
 *
 * // Pre-created pool
 * import mysql from 'mysql2/promise'
 * const pool = mysql.createPool({ host: 'localhost', database: 'mydb' })
 * const driver = new Mysql2Driver(pool)
 * ```
 *
 * Requires `mysql2` to be installed:
 * ```bash
 * pnpm add mysql2
 * ```
 */
export class Mysql2Driver implements TMysqlDriver {
  private pool: import('mysql2/promise').Pool

  constructor(
    poolOrConfig: string | import('mysql2/promise').Pool | import('mysql2/promise').PoolOptions
  ) {
    if (typeof poolOrConfig === 'object' && 'execute' in poolOrConfig) {
      // Pre-created pool instance
      this.pool = poolOrConfig as import('mysql2/promise').Pool
    } else {
      // Dynamic require to keep mysql2 optional at the package level
      // oxlint-disable-next-line typescript-eslint/no-var-requires -- dynamic require for optional peer dep
      const mysql = require('mysql2/promise') as typeof import('mysql2/promise')
      if (typeof poolOrConfig === 'string') {
        this.pool = mysql.createPool({ uri: poolOrConfig, supportBigNumbers: true, bigNumberStrings: false })
      } else {
        this.pool = mysql.createPool({ supportBigNumbers: true, bigNumberStrings: false, ...poolOrConfig })
      }
    }
  }

  async run(sql: string, params?: unknown[]): Promise<TMysqlRunResult> {
    const [result] = await this.pool.execute(sql, params ?? [])
    const header = result as import('mysql2').ResultSetHeader
    return {
      affectedRows: header.affectedRows ?? 0,
      insertId: header.insertId ?? 0,
      changedRows: header.changedRows ?? 0,
    }
  }

  async all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const [rows] = await this.pool.execute(sql, params ?? [])
    return rows as T[]
  }

  async get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
    const [rows] = await this.pool.execute(sql, params ?? [])
    return (rows as T[])[0] ?? null
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql)
  }

  async getConnection(): Promise<TMysqlConnection> {
    const conn = await this.pool.getConnection()
    return {
      async run(sql: string, params?: unknown[]): Promise<TMysqlRunResult> {
        const [result] = await conn.execute(sql, params ?? [])
        const header = result as import('mysql2').ResultSetHeader
        return {
          affectedRows: header.affectedRows ?? 0,
          insertId: header.insertId ?? 0,
          changedRows: header.changedRows ?? 0,
        }
      },
      async all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
        const [rows] = await conn.execute(sql, params ?? [])
        return rows as T[]
      },
      async get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
        const [rows] = await conn.execute(sql, params ?? [])
        return (rows as T[])[0] ?? null
      },
      async exec(sql: string): Promise<void> {
        await conn.query(sql)
      },
      release() {
        conn.release()
      },
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
