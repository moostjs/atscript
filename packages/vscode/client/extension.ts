/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { exec, execSync } from 'child_process'
import type { ExtensionContext } from 'vscode'
import { Uri, workspace, window, env } from 'vscode'
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'
import * as fs from 'fs'
import * as path from 'path'

let client: LanguageClient | undefined

/**
 * Reads the production dependencies from the extension's package.json
 */
function getRequiredDependencies(extensionPath: string): string[] {
  try {
    const pkgPath = path.join(extensionPath, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    return Object.keys(pkg.dependencies || {})
  } catch {
    return ['@atscript/core']
  }
}

/**
 * Gets the global node_modules path via npm
 */
function getGlobalNodeModulesPath(): string | undefined {
  try {
    return execSync('npm root -g', { encoding: 'utf-8', timeout: 5000 }).trim()
  } catch {
    return undefined
  }
}

/**
 * Checks if a dependency is available locally or globally.
 * Returns 'local' | 'global' | false
 */
function findDependency(
  extensionPath: string,
  dep: string,
  globalNodeModulesPath?: string
): 'local' | 'global' | false {
  if (fs.existsSync(path.join(extensionPath, 'node_modules', dep))) return 'local'
  if (globalNodeModulesPath && fs.existsSync(path.join(globalNodeModulesPath, dep)))
    return 'global'
  return false
}

/**
 * Checks all dependencies and returns whether they're all found
 * and whether any require the global node_modules path
 */
function checkDependencies(
  extensionPath: string,
  deps: string[],
  globalNodeModulesPath?: string
): { allFound: boolean; needsGlobalPath: boolean } {
  let allFound = true
  let needsGlobalPath = false
  for (const dep of deps) {
    const location = findDependency(extensionPath, dep, globalNodeModulesPath)
    if (!location) {
      allFound = false
      break
    }
    if (location === 'global') {
      needsGlobalPath = true
    }
  }
  return { allFound, needsGlobalPath }
}

/**
 * Detects the best available package manager: pnpm > yarn > npm
 */
function detectPackageManager(): Promise<string> {
  return new Promise(resolve => {
    exec('pnpm --version', error => {
      if (!error) return resolve('pnpm')
      exec('yarn --version', error => {
        if (!error) return resolve('yarn')
        resolve('npm')
      })
    })
  })
}

/**
 * Returns the install command for the given package manager (production deps only)
 */
function getInstallCommand(pm: string): string {
  switch (pm) {
    case 'pnpm':
      return 'pnpm install --prod'
    case 'yarn':
      return 'yarn install --production'
    default:
      return 'npm install --omit=dev'
  }
}

/**
 * Attempts to install dependencies using the best available package manager.
 * On failure, shows actionable error messages with copy-paste commands.
 */
async function installDependencies(extensionPath: string, deps: string[]): Promise<boolean> {
  const pm = await detectPackageManager()
  const installCmd = getInstallCommand(pm)

  window.showInformationMessage('Atscript: Installing dependencies...')

  return new Promise(resolve => {
    exec(installCmd, { cwd: extensionPath }, error => {
      if (error) {
        const localCmd = `cd "${extensionPath}" && ${installCmd}`
        const globalCmd = `npm install -g ${deps.join(' ')}`

        window
          .showErrorMessage(
            `Atscript: Failed to install dependencies.`,
            'Copy local install command',
            'Copy global install command'
          )
          .then(choice => {
            if (choice === 'Copy local install command') {
              env.clipboard.writeText(localCmd)
              window.showInformationMessage(`Copied: ${localCmd}`)
            } else if (choice === 'Copy global install command') {
              env.clipboard.writeText(globalCmd)
              window.showInformationMessage(`Copied: ${globalCmd}`)
            }
          })

        resolve(false)
      } else {
        window.showInformationMessage('Atscript: Dependencies installed successfully.')
        resolve(true)
      }
    })
  })
}

export function activate(context: ExtensionContext) {
  const extensionPath = context.extensionUri.fsPath
  const deps = getRequiredDependencies(extensionPath)
  const globalNodeModulesPath = getGlobalNodeModulesPath()

  let retryInterval: ReturnType<typeof setInterval> | undefined

  function startLanguageServer(useGlobalPath: boolean) {
    if (client) return // already started

    const serverModule = Uri.joinPath(context.extensionUri, 'dist', 'server.cjs').fsPath
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] }

    // If deps are found globally, set NODE_PATH so the server process can resolve them
    const serverEnv =
      useGlobalPath && globalNodeModulesPath
        ? {
            ...process.env,
            NODE_PATH: [process.env.NODE_PATH, globalNodeModulesPath]
              .filter(Boolean)
              .join(path.delimiter),
          }
        : undefined

    const serverOptions: ServerOptions = {
      run: {
        module: serverModule,
        transport: TransportKind.ipc,
        ...(serverEnv ? { options: { env: serverEnv } } : {}),
      },
      debug: {
        module: serverModule,
        transport: TransportKind.ipc,
        options: {
          ...debugOptions,
          ...(serverEnv ? { env: serverEnv } : {}),
        },
      },
    }

    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file', language: 'atscript' }],
      synchronize: {
        fileEvents: [
          workspace.createFileSystemWatcher('**/*.as'),
          workspace.createFileSystemWatcher('**/atscript.config.{js,ts,mjs,mts,cjs,cts}'),
        ],
      },
    }

    client = new LanguageClient(
      'atscriptLangServer',
      'Atscript Language Server',
      serverOptions,
      clientOptions
    )
    client.start()

    workspace.findFiles('**/*.as').then(files => {
      client!.sendNotification(
        'workspace/files',
        files.map(file => file.toString())
      )
    })

    context.subscriptions.push(client)
  }

  /**
   * Checks if deps are available and starts the server if so.
   * Returns true if the server was started.
   */
  function tryStart(isRetry = false): boolean {
    if (client) return true
    const { allFound, needsGlobalPath } = checkDependencies(
      extensionPath,
      deps,
      globalNodeModulesPath
    )
    if (allFound) {
      if (retryInterval) {
        clearInterval(retryInterval)
        retryInterval = undefined
      }
      if (isRetry) {
        window.showInformationMessage(
          'Atscript: Dependencies detected, starting language server...'
        )
      } else {
        console.log('✔ Dependencies already installed.')
      }
      startLanguageServer(needsGlobalPath)
      return true
    }
    return false
  }

  async function init() {
    // Check if deps are already available
    if (tryStart()) return

    // Try installing
    const installed = await installDependencies(extensionPath, deps)
    if (installed && tryStart()) return

    // Installation failed — set up a 1-minute retry interval
    // that checks if deps have been installed (locally or globally)
    window.showInformationMessage(
      'Atscript: Will check for dependencies every minute. Install them to activate the extension.'
    )
    retryInterval = setInterval(() => tryStart(true), 60_000)
  }

  init()

  context.subscriptions.push({
    dispose() {
      if (retryInterval) {
        clearInterval(retryInterval)
        retryInterval = undefined
      }
    },
  })
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop()
}
