import * as fs from 'fs'
import * as path from 'path'

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { ExtensionContext } from 'vscode'
import { Uri, workspace, window, commands } from 'vscode'
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

let client: LanguageClient | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined

const RETRY_INTERVAL = 60_000

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
 * Gets the workspace folder paths from VSCode
 */
function getWorkspacePaths(): string[] {
  return (workspace.workspaceFolders || []).map(f => f.uri.fsPath)
}

/**
 * Finds a dependency by checking workspace node_modules first, then extension local.
 * Returns the node_modules directory path where the dep was found, or undefined.
 */
function findDependency(
  dep: string,
  workspacePaths: string[],
  extensionPath: string
): string | undefined {
  // Check workspace node_modules first
  for (const wsPath of workspacePaths) {
    const nodeModulesDir = path.join(wsPath, 'node_modules')
    if (fs.existsSync(path.join(nodeModulesDir, dep))) {
      return nodeModulesDir
    }
  }
  // Check extension's own node_modules
  const extNodeModules = path.join(extensionPath, 'node_modules')
  if (fs.existsSync(path.join(extNodeModules, dep))) {
    return extNodeModules
  }
  return undefined
}

/**
 * Checks all dependencies and returns the node_modules path to use for NODE_PATH,
 * or undefined if deps are not found.
 */
function resolveDependencies(
  deps: string[],
  workspacePaths: string[],
  extensionPath: string
): string | undefined {
  let resolvedPath: string | undefined
  for (const dep of deps) {
    const found = findDependency(dep, workspacePaths, extensionPath)
    if (!found) {
      return undefined
    }
    // Use the first resolved path (all deps should ideally come from the same location)
    if (!resolvedPath) {
      resolvedPath = found
    }
  }
  return resolvedPath
}

export function activate(context: ExtensionContext) {
  const extensionPath = context.extensionUri.fsPath
  const deps = getRequiredDependencies(extensionPath)

  function startLanguageServer(nodeModulesPath: string) {
    if (client) {
      return
    }

    const serverModule = Uri.joinPath(context.extensionUri, 'dist', 'server.cjs').fsPath
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] }

    // Set NODE_PATH so the server process can resolve @atscript/core
    const serverEnv = {
      ...process.env,
      NODE_PATH: [process.env.NODE_PATH, nodeModulesPath].filter(Boolean).join(path.delimiter),
    }

    const serverOptions: ServerOptions = {
      run: {
        module: serverModule,
        transport: TransportKind.ipc,
        options: { env: serverEnv },
      },
      debug: {
        module: serverModule,
        transport: TransportKind.ipc,
        options: { ...debugOptions, env: serverEnv },
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

  function tryStart(): boolean {
    if (client) {
      return true
    }
    const workspacePaths = getWorkspacePaths()
    const nodeModulesPath = resolveDependencies(deps, workspacePaths, extensionPath)
    if (nodeModulesPath) {
      startLanguageServer(nodeModulesPath)
      return true
    }
    return false
  }

  function scheduleRetry() {
    if (retryTimer) {
      return
    }
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      if (!client && tryStart()) {
        window.showInformationMessage('Atscript: Language server started successfully.')
      } else if (!client) {
        scheduleRetry()
      }
    }, RETRY_INTERVAL)
  }

  if (!tryStart()) {
    window.showWarningMessage(
      'Atscript: @atscript/core not found in project. LSP features require @atscript/core to be installed. Retrying in 60s...'
    )
    scheduleRetry()
  }

  context.subscriptions.push(
    commands.registerCommand('atscript.restartServer', async () => {
      window.showInformationMessage('Atscript: Restarting language server...')
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = undefined
      }
      if (client) {
        await client.stop()
        client = undefined
      }
      if (!tryStart()) {
        window.showWarningMessage(
          'Atscript: @atscript/core not found in project. LSP features require @atscript/core to be installed. Retrying in 60s...'
        )
        scheduleRetry()
      }
    })
  )
}

export function deactivate(): Thenable<void> | undefined {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = undefined
  }
  return client?.stop()
}
