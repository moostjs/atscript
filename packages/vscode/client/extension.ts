/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { exec } from 'child_process'
import type { ExtensionContext } from 'vscode'
import { Uri, workspace, window } from 'vscode'
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'
import * as fs from 'fs'
import * as path from 'path'

let client: LanguageClient | undefined

async function ensureDependenciesInstalled(extensionPath: string) {
  const nodeModulesPath = path.join(extensionPath, 'node_modules')
  if (fs.existsSync(nodeModulesPath)) {
    console.log('✔ Dependencies already installed.')
    return true
  }

  window.showInformationMessage('Installing dependencies for Anscript extension...')

  return new Promise(resolve => {
    exec('npm install --omit=dev', { cwd: extensionPath }, error => {
      if (error) {
        window.showErrorMessage(
          'Failed to install dependencies. Try running `npm install` manually.'
        )
        resolve(false)
      } else {
        window.showInformationMessage('Dependencies installed successfully.')
        resolve(true)
      }
    })
  })
}

export function activate(context: ExtensionContext) {
  const extensionPath = context.extensionUri.fsPath
  // const coreModulePath = path.join(extensionPath, 'node_modules', '@ts-anscript/core')

  async function startLanguageServer() {
    const installed = await ensureDependenciesInstalled(extensionPath)
    if (!installed) {
      return
    }

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

  startLanguageServer()
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop()
}
