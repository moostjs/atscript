import { TAnscriptPlugin } from '@anscript/core'
import { TypeRenderer, JsRenderer } from './codegen'
import path from 'path'

export const tsPlugin: () => TAnscriptPlugin = () => {
  return {
    name: 'typesccript',
    render(doc, format) {
      if (format === 'dts') {
        return [
          {
            fileName: `${doc.name}.d.ts`,
            content: new TypeRenderer(doc).render(),
          },
        ]
      }
      if (format === 'js') {
        return [
          {
            fileName: `${doc.name}.js`,
            content: new JsRenderer(doc).render(),
          },
        ]
      }
    },

    buildEnd(output, format, repo) {
      if (format === 'dts') {
        // render anscript.d.ts
        output.push({
          content:
            'export {}\n\n' +
            'declare global {\n' +
            '  interface AnscriptMetadata {\n' +
            '    label: string;\n' +
            '  }\n' +
            '}\n',
          fileName: 'anscript.d.ts',
          source: '',
          target: path.join(repo.root, 'anscript.d.ts'),
        })
      }
    },
  } as TAnscriptPlugin
}
