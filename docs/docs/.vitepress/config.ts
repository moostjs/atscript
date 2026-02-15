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
      {
        text: 'TypeScript',
        items: [
          { text: 'Guide', link: '/packages/typescript/' },
          // { text: 'MongoDB', link: '/packages/mongo/' },
          // { text: 'Moost MongoDB', link: '/packages/moost-mongo/' },
          { text: 'Moost Validator', link: '/packages/moost-validator/' },
        ],
      },
      { text: 'VSCode', link: '/packages/vscode/' },
      // { text: 'Plugin Development', link: '/plugin-development/' },
    ],

    sidebar: {
      '/packages/typescript/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Overview', link: '/packages/typescript/' },
            { text: 'Why Atscript?', link: '/packages/typescript/why-atscript' },
            { text: 'Atscript Validation vs Others', link: '/packages/typescript/validation-comparison' },
            { text: 'Quick Start', link: '/packages/typescript/quick-start' },
          ],
        },
        {
          text: 'Atscript Syntax',
          items: [
            { text: 'Interfaces & Types', link: '/packages/typescript/interfaces-types' },
            { text: 'Imports & Exports', link: '/packages/typescript/imports-exports' },
            { text: 'Primitives', link: '/packages/typescript/primitives' },
            { text: 'Annotations', link: '/packages/typescript/annotations' },
            { text: 'Ad-hoc Annotations', link: '/packages/typescript/ad-hoc-annotations' },
          ],
        },
        {
          text: 'Runtime API',
          items: [
            { text: 'Metadata', link: '/packages/typescript/metadata-export' },
            { text: 'Validation', link: '/packages/typescript/validation' },
            { text: 'JSON Schema', link: '/packages/typescript/json-schema' },
            { text: 'Serialization', link: '/packages/typescript/serialization' },
            { text: 'Type Definitions', link: '/packages/typescript/type-definitions' },
          ],
        },
        {
          text: 'Setup & Tooling',
          items: [
            { text: 'Configuration', link: '/packages/typescript/configuration' },
            { text: 'CLI', link: '/packages/typescript/cli' },
            { text: 'Build Setup', link: '/packages/typescript/build-setup' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Custom Primitives', link: '/packages/typescript/custom-primitives' },
            { text: 'Custom Annotations', link: '/packages/typescript/custom-annotations' },
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
            { text: 'Atscript vs Others', link: '/packages/moost-validator/why-atscript-validation' },
            { text: 'Validation Pipe', link: '/packages/moost-validator/validation-pipe' },
            { text: 'Error Handling', link: '/packages/moost-validator/error-handling' },
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
            { text: 'Configuration', link: '/packages/vscode/configuration' },
          ],
        },
      ],

      '/plugin-development/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview', link: '/plugin-development/' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Architecture', link: '/plugin-development/architecture' },
            { text: 'Parser & AST', link: '/plugin-development/parser-ast' },
            { text: 'Semantic Nodes', link: '/plugin-development/semantic-nodes' },
            { text: 'Plugin System', link: '/plugin-development/plugin-system' },
            { text: 'Annotation System', link: '/plugin-development/annotation-system' },
            { text: 'Type System', link: '/plugin-development/type-system' },
          ],
        },
        {
          text: 'Language Extensions',
          items: [
            { text: 'Plugin Hooks', link: '/plugin-development/plugin-hooks' },
            { text: 'Code Generation', link: '/plugin-development/code-generation' },
            { text: 'Primitives & Type Tags', link: '/plugin-development/primitives-type-tags' },
            { text: 'Testing Plugins', link: '/plugin-development/testing-plugins' },
          ],
        },
        {
          text: 'LSP Development',
          items: [
            { text: 'LSP Overview', link: '/plugin-development/lsp-overview' },
            { text: 'Diagnostics', link: '/plugin-development/diagnostics' },
            { text: 'Completions & Navigation', link: '/plugin-development/completions-navigation' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Core API', link: '/plugin-development/core-api' },
            { text: 'Plugin API', link: '/plugin-development/plugin-api' },
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
