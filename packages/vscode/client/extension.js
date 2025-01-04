'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.activate = activate
exports.deactivate = deactivate
// client/extension.ts
const vscode_1 = require('vscode')
const node_1 = require('vscode-languageclient/node')

let client
function activate(context) {
  // The server is implemented in server/server.js (transpiled from server/server.ts).
  const serverModule = vscode_1.Uri.joinPath(
    context.extensionUri,
    'dist',
    'server',
    'server.js'
  ).fsPath
  // Optional debug options
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] }
  const serverOptions = {
    run: { module: serverModule, transport: node_1.TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: node_1.TransportKind.ipc,
      options: debugOptions,
    },
  }
  // Client options: define how the language client works
  const clientOptions = {
    // register server for ITN language
    documentSelector: [{ scheme: 'file', language: 'intertation' }],
    synchronize: {
      // watch .intertation files
      fileEvents: vscode_1.workspace.createFileSystemWatcher('**/*.intertation'),
    },
  }
  // Create the language client and start it
  client = new node_1.LanguageClient(
    'adsLangServer', // internal ID
    'ITN Language Server', // display name
    serverOptions,
    clientOptions
  )
  client.start()
  // If you want to dispose it on extension deactivate
  context.subscriptions.push(client)
}
function deactivate() {
  // Stop the language client if it's running
  return client === null || client === void 0 ? void 0 : client.stop()
}
