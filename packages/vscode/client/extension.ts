/* eslint-disable @typescript-eslint/no-non-null-assertion */
// client/extension.ts
import type { ExtensionContext } from 'vscode'
import { Uri, workspace, window } from 'vscode'
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'
import * as fs from 'fs'
import * as path from 'path'

let client: LanguageClient | undefined

export function activate(context: ExtensionContext) {
  const extensionPath = context.extensionUri.fsPath
  const coreModulePath = path.join(extensionPath, 'node_modules', '@ts-anscript/core')

  function isCoreInstalled(): boolean {
    return fs.existsSync(coreModulePath)
  }

  async function waitForCoreInstallation() {
    if (isCoreInstalled()) {
      startLanguageServer()
      return
    }

    window.showInformationMessage(
      'Waiting for @ts-anscript/core to be installed... ' + coreModulePath
    )

    // Watch for changes in `node_modules`
    const watcher = fs.watch(
      path.join(extensionPath, 'node_modules'),
      { recursive: true },
      (_, filename) => {
        if (filename?.includes('@ts-anscript/core')) {
          watcher.close()
          startLanguageServer()
        }
      }
    )

    // Fallback: Periodically check every 5 seconds
    const interval = setInterval(() => {
      if (isCoreInstalled()) {
        clearInterval(interval)
        watcher.close()
        startLanguageServer()
      }
    }, 5000)
  }

  function startLanguageServer() {
    // The server is implemented in server/server.js (transpiled from server/server.ts).
    const serverModule = Uri.joinPath(context.extensionUri, 'dist', 'server.cjs').fsPath

    // Optional debug options
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] }

    const serverOptions: ServerOptions = {
      run: { module: serverModule, transport: TransportKind.ipc },
      debug: {
        module: serverModule,
        transport: TransportKind.ipc,
        options: debugOptions,
      },
    }

    // Client options: define how the language client works
    const clientOptions: LanguageClientOptions = {
      // register server for Anscript language
      documentSelector: [{ scheme: 'file', language: 'anscript' }],
      synchronize: {
        fileEvents: [
          // watch .as files
          workspace.createFileSystemWatcher('**/*.as'),
          // watch anscript config files
          workspace.createFileSystemWatcher('**/anscript.config.{js,ts,mjs,mts,cjs,cts}'),
        ],
      },
    }

    // Create the language client and start it
    client = new LanguageClient(
      'anscriptLangServer', // internal ID
      'Anscript Language Server', // display name
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

    window.showInformationMessage('@ts-anscript/core detected, starting language server.')

    // If you want to dispose it on extension deactivate
    context.subscriptions.push(client)
  }

  // Ensure core is installed before starting
  waitForCoreInstallation()
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop()
}
