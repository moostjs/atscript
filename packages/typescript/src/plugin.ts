import path from 'path'

// oxlint-disable arrow-body-style
import type { TAtscriptPlugin } from '@atscript/core'
import { DEFAULT_FORMAT } from '@atscript/core'

import { TypeRenderer, JsRenderer } from './codegen'
import { escapeQuotes, wrapProp } from './codegen/utils'

export interface TTsPluginOptions {
  /**
   * JSON Schema support mode:
   * - `false` — No support. `toJsonSchema()` throws at runtime. No `buildJsonSchema` import. *(default)*
   * - `'lazy'` — Import `buildJsonSchema`, compute on demand, cache in type object.
   * - `'bundle'` — Pre-compute at build time, embed static JSON in output. No import.
   *
   * Individual interfaces can override this with `@emit.jsonSchema` annotation
   * to force build-time embedding regardless of this setting.
   */
  jsonSchema?: false | 'lazy' | 'bundle'

  /**
   * Example data support:
   * - `false` — No support. `toExampleData` is not rendered. *(default)*
   * - `true` — Import `createDataFromAnnotatedType`, create example data on each call.
   */
  exampleData?: boolean

  /**
   * Extension the emitted JS uses for **relative** `.as` imports
   * (`./user` → `./user.as` by default). Bare specifiers (packages, e.g.
   * `some-pkg/models/user.as`) always keep `.as` because they resolve through
   * the package's `exports` map.
   *
   * `.as.mjs` is what `asc db sync` uses to load the compiled models straight
   * from Node. *(default: `'.as'`)*
   */
  moduleExtension?: '.as' | '.as.js' | '.as.mjs'

  /**
   * Emit a build-time compiled validator check per type into the `.as.js` output.
   *
   * `validate()` then runs the type's compiled check instead of the interpreted pre-check
   * (results and errors are identical; only speed differs). The check binds to the live
   * type on first use and re-binds after mutations made through `annotate()`, the
   * metadata / props `Map` methods, the `defineAnnotatedType()` handle and `cloneRefProp()`.
   * Raw writes need `invalidateCompiledValidators()`: property writes (`node.optional = …`,
   * `type.items.push(…)`, …) and in-place edits of annotation values (mutating a constraint
   * object, pushing onto an `@expect.pattern` array directly) — the check keeps the values
   * it bound until then. Any runtime mutation of a type a check has bound to makes the
   * checks re-bind once on next use: cheap at startup, but avoid it per request. Types it
   * cannot bind to, and types not built from generated modules (deserialised,
   * JSON-schema-built, flattened, hand-built), are validated by the interpreted path as
   * before.
   *
   * Adds code to every `.as.js`: meant for backend builds — leave it off for bundles
   * shipped to browsers (the code is CSP-safe: no `eval` / `new Function`). The
   * `'js:compiled'` / `'js:interpreted'` render formats force it on / off per render.
   * *(default: `false`)*
   */
  compileValidators?: boolean
}

/**
 * Render formats of the JS output that override {@link TTsPluginOptions.compileValidators}
 * (used by `unplugin-atscript`'s `compileValidators` option).
 */
export const JS_COMPILED_FORMAT = 'js:compiled'
export const JS_INTERPRETED_FORMAT = 'js:interpreted'

/**
 * Resolves the effective JSON schema mode from plugin options.
 */
export function resolveJsonSchemaMode(opts?: TTsPluginOptions): false | 'lazy' | 'bundle' {
  if (opts?.jsonSchema !== undefined) {
    return opts.jsonSchema
  }
  return false
}

export const tsPlugin: (opts?: TTsPluginOptions) => TAtscriptPlugin = opts => {
  return {
    name: 'typescript',

    render(doc, format) {
      if (format === 'dts' || format === DEFAULT_FORMAT) {
        return [
          {
            fileName: `${doc.name}.d.ts`,
            content: new TypeRenderer(doc, opts).render(),
          },
        ]
      }
      if (format === 'js' || format === JS_COMPILED_FORMAT || format === JS_INTERPRETED_FORMAT) {
        const jsOpts =
          format === 'js' ? opts : { ...opts, compileValidators: format === JS_COMPILED_FORMAT }
        return [
          {
            fileName: `${doc.name}.js`,
            content: new JsRenderer(doc, jsOpts).render(),
          },
        ]
      }
    },

    async buildEnd(output, format, repo) {
      if (format === 'dts' || format === DEFAULT_FORMAT) {
        // render atscript.d.ts
        const annotations = await repo.getUsedAnnotations()
        const tags = (await repo.getPrimitivesTags()) || new Set()
        const rendered = [] as string[]
        for (const [key, val] of Object.entries(annotations)) {
          const multiple = val!.multiple
          const typeLine = Array.from(val!.types)
            .map(t => {
              if (t.type === 'object' && 'props' in t) {
                return `{ ${Object.entries(t.props)
                  .map(
                    ([k, v]) =>
                      `${wrapProp(k)}${(v as { optional?: boolean }).optional ? '?' : ''}: ${(v as { type: string }).type}`
                  )
                  .join(', ')} }`
              } else {
                return 'optional' in t && t.optional ? `${t.type} | true` : t.type
              }
            })
            .join(' | ')
          rendered.push(
            `${wrapProp(key)}: ${multiple ? '(' : ''}${typeLine}${multiple ? ')[]' : ''}`
          )
        }
        const renderedTags = Array.from(tags)
          .map(f => `"${escapeQuotes(f)}"`)
          .join(' | ')
        output.push({
          content:
            // oxlint-disable-next-line prefer-template
            '// prettier-ignore-start\n' +
            '/* eslint-disable */\n' +
            '/* oxlint-disable */\n' +
            '/**\n' +
            ' * 🪄 This file was generated by Atscript\n' +
            ' * It is generated based on annotations used in this project\n' +
            ' * Do not edit this file!\n' +
            ' *\n' +
            ' * Use `npx asc -f dts` command to re-generate this file\n' +
            ' */\n' +
            'export {}\n\n' +
            'declare global {\n' +
            '  interface AtscriptMetadata {\n    ' +
            rendered.join('\n    ') +
            '\n  }\n' +
            '  type AtscriptPrimitiveTags = ' +
            renderedTags +
            '\n' +
            '}\n' +
            '// prettier-ignore-end',
          fileName: 'atscript.d.ts',
          source: '',
          target: path.join(repo.root, 'atscript.d.ts'),
        })
      }
    },
  } as TAtscriptPlugin
}
