/* eslint-disable @typescript-eslint/no-non-null-assertion */
// client/extension.ts
import type { ExtensionContext } from 'vscode'
import { Uri, workspace } from 'vscode'
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

let client: LanguageClient | undefined

export function activate(context: ExtensionContext) {
  // The server is implemented in server/server.js (transpiled from server/server.ts).
  const serverModule = Uri.joinPath(context.extensionUri, 'dist', 'server.js').fsPath

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
    // register server for ITN language
    documentSelector: [{ scheme: 'file', language: 'intertation' }],
    synchronize: {
      // watch .intertation files
      fileEvents: workspace.createFileSystemWatcher('**/*.itn'),
    },
  }

  // Create the language client and start it
  client = new LanguageClient(
    'adsLangServer', // internal ID
    'ITN Language Server', // display name
    serverOptions,
    clientOptions
  )
  client.start()

  workspace.findFiles('**/*.itn').then(files => {
    console.log(files)
    client!.sendNotification(
      'workspace/files',
      files.map(file => file.toString())
    )
  })

  // If you want to dispose it on extension deactivate
  context.subscriptions.push(client)
}

export function deactivate(): Thenable<void> | undefined {
  // Stop the language client if it's running
  return client?.stop()
}
