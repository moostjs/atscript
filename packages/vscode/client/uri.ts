import { pathToFileURL } from 'url'

/**
 * The URI the language server knows a document by: a file's `file:` URL as `pathToFileURL` writes
 * it, the form `@atscript/core` builds the ids of the files a document imports in (VS Code's own
 * URIs encode more characters, `@` and `+` among them). Any other URI as VS Code writes it.
 */
export function protocolUri(uri: { scheme: string; fsPath: string; toString: () => string }) {
  return uri.scheme === 'file' ? pathToFileURL(uri.fsPath).href : uri.toString()
}
