import { defineConfig } from 'vitepress'
import llmstxtPlugin from 'vitepress-plugin-llmstxt'

const atscriptGrammar = {
  name: 'atscript',
  scopeName: 'source.atscript',
  fileTypes: ['atscript', 'as'],
  patterns: [
    { include: '#annotation-with-args' },
    { include: '#annotations' },
    { include: '#comments' },
    { include: '#strings' },
    { include: '#property-names' },
    { include: '#import-statement' },
    { include: '#keywords' },
    { include: '#numbers' },
    { include: '#operators' },
    { include: '#punctuation' },
    { include: '#global-types' },
  ],
  repository: {
    'comments': {
      patterns: [
        {
          name: 'comment.line.double-slash.atscript',
          match: '//.*$',
        },
        {
          name: 'comment.block.atscript',
          begin: '/\\*',
          end: '\\*/',
          patterns: [
            {
              match: '\\*\\/',
              name: 'invalid.illegal.stray.end-of-comment.atscript',
            },
          ],
        },
      ],
    },

    'strings': {
      patterns: [
        {
          match: '\'([^\']*)\'|"([^"]*)"',
          name: 'string.quoted.atscript',
        },
      ],
    },

    'import-statement': {
      patterns: [
        {
          name: 'meta.import.statement',
          begin: '(?<![A-Za-z0-9_$])\\bimport\\b(?!\\s*[:=])',
          beginCaptures: {
            '0': {
              name: 'keyword.control.import.atscript',
            },
          },
          end: '(?=;|$)',
          patterns: [
            {
              match: '\\bfrom\\b',
              name: 'keyword.control.from.atscript',
            },
            {
              begin: '\\{',
              beginCaptures: {
                '0': {
                  name: 'punctuation.section.braces',
                },
              },
              end: '\\}',
              endCaptures: {
                '0': {
                  name: 'punctuation.section.braces',
                },
              },
              patterns: [
                {
                  name: 'entity.name.type.atscript',
                  match: '\\b[A-Za-z_$][A-Za-z0-9_$]*\\b',
                },
              ],
            },
            {
              match: '\'([^\']*)\'|"([^"]*)"',
              name: 'string.quoted.import.atscript',
            },
          ],
        },
      ],
    },

    'keywords': {
      patterns: [
        {
          match: '(?<![A-Za-z0-9_$])\\bexport\\b(?!\\s*[:=])',
          name: 'keyword.control.export.atscript',
        },
        {
          match: '(\\b(?:type|interface)\\b)\\s+([A-Za-z_][A-Za-z0-9_]*)',
          captures: {
            '1': {
              name: 'storage.type.atscript',
            },
            '2': {
              name: 'entity.name.type.atscript',
            },
          },
        },
        {
          match: '(\\bannotate\\b)\\s+([A-Za-z_][A-Za-z0-9_]*)(?:\\s+(as)\\s+([A-Za-z_][A-Za-z0-9_]*))?',
          captures: {
            '1': {
              name: 'storage.type.atscript',
            },
            '2': {
              name: 'entity.name.type.atscript',
            },
            '3': {
              name: 'keyword.control.as.atscript',
            },
            '4': {
              name: 'entity.name.type.atscript',
            },
          },
        },
      ],
    },

    'numbers': {
      patterns: [
        {
          name: 'constant.numeric.atscript',
          match: '\\b\\d+(\\.\\d+)?\\b',
        },
      ],
    },

    'operators': {
      patterns: [
        {
          name: 'keyword.operator.atscript',
          match: '[|&=?]',
        },
      ],
    },

    'annotations': {
      patterns: [
        {
          name: 'keyword.control.at-rule.atscript',
          match: '@[A-Za-z0-9_.]+',
        },
      ],
    },

    'annotation-with-args': {
      patterns: [
        {
          begin: '(@[A-Za-z0-9_.]+)',
          beginCaptures: {
            '1': {
              name: 'keyword.control.at-rule.atscript',
            },
          },
          end: '(?=$|\\n|\\r|;)',
          patterns: [
            {
              name: 'constant.numeric.atscript',
              match: '\\b\\d+(\\.\\d+)?\\b',
            },
            {
              name: 'string.quoted.single.atscript',
              begin: "'",
              end: "(?:'|\\n)",
              patterns: [
                {
                  match: '\\\\.',
                  name: 'constant.character.escape.atscript',
                },
              ],
            },
            {
              name: 'string.quoted.double.atscript',
              begin: '"',
              end: '(?:"|\\n)',
              patterns: [
                {
                  match: '\\\\.',
                  name: 'constant.character.escape.atscript',
                },
              ],
            },
            {
              name: 'constant.language.boolean.atscript',
              match: '\\b(?:true|false|undefined|null)\\b',
            },
          ],
        },
      ],
    },

    'punctuation': {
      patterns: [
        {
          name: 'punctuation.separator.comma.atscript',
          match: ',',
        },
        {
          name: 'punctuation.terminator.statement.atscript',
          match: ';',
        },
        {
          name: 'punctuation.separator.key-value.atscript',
          match: ':',
        },
        {
          name: 'punctuation.section.parens.begin.atscript',
          match: '\\(',
        },
        {
          name: 'punctuation.section.parens.end.atscript',
          match: '\\)',
        },
        {
          name: 'punctuation.section.braces.begin.atscript',
          match: '\\{',
        },
        {
          name: 'punctuation.section.braces.end.atscript',
          match: '\\}',
        },
        {
          name: 'punctuation.section.brackets.begin.atscript',
          match: '\\[',
        },
        {
          name: 'punctuation.section.brackets.end.atscript',
          match: '\\]',
        },
      ],
    },

    'global-types': {
      patterns: [
        {
          name: 'support.type.primitive.atscript',
          match:
            '\\b(?:number|string|boolean|void|undefined|null|never|any|unknown|bigint|symbol)\\b(?!\\s*:)',
        },
        {
          name: 'support.type.semantic.atscript',
          match: '\\b(string|number|boolean|mongo)\\.(\\w+)\\b',
          captures: {
            '1': {
              name: 'support.type.primitive.atscript',
            },
            '2': {
              name: 'support.type.semantic.atscript',
            },
          },
        },
      ],
    },

    'property-names': {
      patterns: [
        {
          name: 'variable.other.property.atscript',
          match: '\\b([A-Za-z_$][A-Za-z0-9_$]*)\\b(?=\\s*:)',
        },
        {
          name: 'variable.other.property.optional.atscript',
          match: '\\b([A-Za-z_$][A-Za-z0-9_$]*)\\b(?=\\?\\s*:)',
        },
      ],
    },
  },
}

export default defineConfig({
  title: 'Atscript',
  description:
    'A universal type and metadata description language for multi-language code generation',
  lang: 'en-US',
  lastUpdated: true,
  cleanUrls: true,

  vite: {
    plugins: [
      llmstxtPlugin({
        hostname: 'atscript.moost.org',
      }),
    ],
  },

  head: [
    ['link', { rel: 'icon', href: '/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#3c8772' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Atscript' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'A universal type and metadata description language for multi-language code generation',
      },
    ],
  ],

  markdown: {
    theme: { light: 'github-light', dark: 'github-dark' },
    lineNumbers: true,
    languages: ['typescript', 'javascript', 'json', 'bash', 'python', 'go', atscriptGrammar as any],
  },

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Atscript',

    nav: [
      { text: 'Guide', link: '/guide/installation' },
      // { text: 'Concepts', link: '/concepts/what-is-atscript' },
      // {
      //   text: 'Packages',
      //   items: [
      //     { text: 'Core', link: '/packages/core/' },
      //     { text: 'TypeScript', link: '/packages/typescript/' },
      //     { text: 'MongoDB', link: '/packages/mongo/' },
      //     { text: 'Moost MongoDB', link: '/packages/moost-mongo/' },
      //     { text: 'Moost Validator', link: '/packages/moost-validator/' },
      //     { text: 'Unplugin', link: '/packages/unplugin/' },
      //     { text: 'VSCode', link: '/packages/vscode/' }
      //   ]
      // },
      // { text: 'API', link: '/api/' },
      // { text: 'Examples', link: '/examples/' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Why Atscript?', link: '/guide/why-atscript' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
          ],
        },
        {
          text: 'Language',
          items: [
            { text: 'Interfaces & Types', link: '/guide/interfaces-types' },
            { text: 'Imports & Exports', link: '/guide/imports-exports' },
            { text: 'Primitives', link: '/guide/primitives' },
            { text: 'Annotations', link: '/guide/annotations' },
            { text: 'Ad-hoc Annotations', link: '/guide/ad-hoc-annotations' },
          ],
        },
        {
          text: 'Configuration',
          items: [
            { text: 'Configuration File', link: '/guide/configuration' },
            { text: 'Build Setup', link: '/guide/build-setup' },
          ],
        },
      ],

      '/concepts/': [
        {
          text: 'Core Concepts',
          items: [
            { text: 'What is Atscript?', link: '/concepts/what-is-atscript' },
            { text: 'Philosophy', link: '/concepts/philosophy' },
            { text: 'Architecture', link: '/concepts/architecture' },
            { text: 'Type System', link: '/concepts/type-system' },
            { text: 'Annotation System', link: '/concepts/annotation-system' },
            { text: 'Parser & AST', link: '/concepts/parser-ast' },
            { text: 'Plugin System', link: '/concepts/plugin-system' },
            { text: 'Code Generation', link: '/concepts/code-generation' },
          ],
        },
      ],

      '/packages/core/': [
        {
          text: '@atscript/core',
          items: [
            { text: 'Overview', link: '/packages/core/' },
            { text: 'Installation', link: '/packages/core/installation' },
            { text: 'Configuration', link: '/packages/core/configuration' },
          ],
        },
        {
          text: 'API',
          items: [
            { text: 'Parser API', link: '/packages/core/parser-api' },
            { text: 'AST Nodes', link: '/packages/core/ast-nodes' },
            { text: 'Document API', link: '/packages/core/document-api' },
            { text: 'Plugin API', link: '/packages/core/plugin-api' },
            { text: 'Annotation Spec', link: '/packages/core/annotation-spec' },
            { text: 'Default Annotations', link: '/packages/core/default-annotations' },
          ],
        },
      ],

      '/packages/typescript/': [
        {
          text: '@atscript/typescript',
          items: [
            { text: 'Overview', link: '/packages/typescript/' },
            { text: 'Installation', link: '/packages/typescript/installation' },
            { text: 'Configuration', link: '/packages/typescript/configuration' },
          ],
        },
        {
          text: 'Features',
          items: [
            { text: 'Code Generation', link: '/packages/typescript/code-generation' },
            { text: 'Type Definitions', link: '/packages/typescript/type-definitions' },
            { text: 'Metadata Export', link: '/packages/typescript/metadata-export' },
            { text: 'Validation', link: '/packages/typescript/validation' },
            { text: 'JSON Schema', link: '/packages/typescript/json-schema' },
            { text: 'Serialization', link: '/packages/typescript/serialization' },
            { text: 'CLI', link: '/packages/typescript/cli' },
          ],
        },
      ],

      '/packages/mongo/': [
        {
          text: '@atscript/mongo',
          items: [
            { text: 'Overview', link: '/packages/mongo/' },
            { text: 'Installation', link: '/packages/mongo/installation' },
            { text: 'Configuration', link: '/packages/mongo/configuration' },
          ],
        },
        {
          text: 'Features',
          items: [
            { text: 'Collections', link: '/packages/mongo/collections' },
            { text: 'Indexes', link: '/packages/mongo/indexes' },
            { text: 'Search Indexes', link: '/packages/mongo/search-indexes' },
            { text: 'Patch Strategies', link: '/packages/mongo/patch-strategies' },
            { text: 'Validation', link: '/packages/mongo/validation' },
          ],
        },
        {
          text: 'Reference',
          items: [{ text: 'Annotations', link: '/packages/mongo/annotations-reference' }],
        },
      ],

      '/packages/moost-mongo/': [
        {
          text: '@atscript/moost-mongo',
          items: [
            { text: 'Overview', link: '/packages/moost-mongo/' },
            { text: 'Installation', link: '/packages/moost-mongo/installation' },
            { text: 'Configuration', link: '/packages/moost-mongo/configuration' },
            { text: 'Controllers', link: '/packages/moost-mongo/controllers' },
            { text: 'Decorators', link: '/packages/moost-mongo/decorators' },
            { text: 'DTOs', link: '/packages/moost-mongo/dtos' },
          ],
        },
      ],

      '/packages/moost-validator/': [
        {
          text: '@atscript/moost-validator',
          items: [
            { text: 'Overview', link: '/packages/moost-validator/' },
            { text: 'Installation', link: '/packages/moost-validator/installation' },
            { text: 'Configuration', link: '/packages/moost-validator/configuration' },
            { text: 'Validation Pipe', link: '/packages/moost-validator/validation-pipe' },
            { text: 'Error Handling', link: '/packages/moost-validator/error-handling' },
            { text: 'Custom Validators', link: '/packages/moost-validator/custom-validators' },
          ],
        },
      ],

      '/packages/unplugin/': [
        {
          text: 'unplugin-atscript',
          items: [
            { text: 'Overview', link: '/packages/unplugin/' },
            { text: 'Installation', link: '/packages/unplugin/installation' },
            { text: 'Configuration', link: '/packages/unplugin/configuration' },
          ],
        },
        {
          text: 'Build Tools',
          items: [
            { text: 'Vite', link: '/packages/unplugin/vite' },
            { text: 'Webpack', link: '/packages/unplugin/webpack' },
            { text: 'Rollup', link: '/packages/unplugin/rollup' },
            { text: 'esbuild', link: '/packages/unplugin/esbuild' },
            { text: 'Rspack', link: '/packages/unplugin/rspack' },
          ],
        },
      ],

      '/packages/vscode/': [
        {
          text: 'VSCode Extension',
          items: [
            { text: 'Overview', link: '/packages/vscode/' },
            { text: 'Installation', link: '/packages/vscode/installation' },
            { text: 'Features', link: '/packages/vscode/features' },
            { text: 'Syntax Highlighting', link: '/packages/vscode/syntax-highlighting' },
            { text: 'IntelliSense', link: '/packages/vscode/intellisense' },
            { text: 'Diagnostics', link: '/packages/vscode/diagnostics' },
            { text: 'Configuration', link: '/packages/vscode/configuration' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Core API', link: '/api/core' },
            { text: 'TypeScript API', link: '/api/typescript' },
            { text: 'MongoDB API', link: '/api/mongo' },
            { text: 'Annotations', link: '/api/annotations' },
            { text: 'Types', link: '/api/types' },
          ],
        },
      ],

      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: 'Basic Usage', link: '/examples/basic-usage' },
            { text: 'MongoDB Models', link: '/examples/mongodb-models' },
            { text: 'Validation', link: '/examples/validation' },
            { text: 'Custom Plugin', link: '/examples/custom-plugin' },
            { text: 'Microservices', link: '/examples/microservices' },
            { text: 'Full Stack App', link: '/examples/full-stack-app' },
          ],
        },
      ],

      '/integrations/': [
        {
          text: 'Integrations',
          items: [
            { text: 'Overview', link: '/integrations/' },
            { text: 'Moost Framework', link: '/integrations/moost-framework' },
            { text: 'NestJS', link: '/integrations/nestjs' },
            { text: 'Express', link: '/integrations/express' },
            { text: 'Fastify', link: '/integrations/fastify' },
            { text: 'GraphQL', link: '/integrations/graphql' },
            { text: 'OpenAPI', link: '/integrations/openapi' },
          ],
        },
      ],

      '/advanced/': [
        {
          text: 'Advanced Topics',
          items: [
            { text: 'Overview', link: '/advanced/' },
            { text: 'Plugin Development', link: '/advanced/plugin-development' },
            { text: 'Custom Annotations', link: '/advanced/custom-annotations' },
            { text: 'Type Extensions', link: '/advanced/type-extensions' },
            { text: 'AST Manipulation', link: '/advanced/ast-manipulation' },
            { text: 'Performance', link: '/advanced/performance' },
            { text: 'Best Practices', link: '/advanced/best-practices' },
            { text: 'Migration Guide', link: '/advanced/migration-guide' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/moostjs/atscript' }],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/moostjs/atscript/edit/main/docs/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the ISC License.',
      copyright: 'Copyright © 2025-present Artem Maltsev',
    },
  },
})
