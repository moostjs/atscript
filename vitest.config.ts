import path from 'path'

import { defineConfig } from 'vitest/config'

// Validator specs also run against build-time compiled checks (`compileValidators`): the
// `compiled` project compiles every validated type at runtime (test-only hook).
const VALIDATOR_SPECS = [
  'packages/typescript/src/validator.spec.ts',
  'packages/typescript/src/nullable-constraints.spec.ts',
  'packages/typescript/src/serialize.spec.ts',
  'packages/typescript/src/json-schema.spec.ts',
  'packages/typescript/src/__test__/validator-fast-path.spec.ts',
  'packages/typescript/src/__test__/coerce.spec.ts',
  'packages/typescript/src/__test__/date-primitives.spec.ts',
]

export default defineConfig({
  test: {
    // `__DYE_*` are compile-time defines of the dye bundler plugin — specs run the sources
    setupFiles: ['./packages/typescript/test/dye-stub.ts'],
    // Generated `.as.js` fixtures share the runtime under test (incl. the mutation tracking
    // of compiled validator checks) instead of the built dist.
    alias: {
      '@atscript/typescript/utils': path.resolve(__dirname, 'packages/typescript/src/utils.ts'),
    },
    projects: [
      { extends: true, test: { name: 'default' } },
      {
        extends: true,
        test: {
          name: 'compiled',
          include: VALIDATOR_SPECS,
          env: { ATSCRIPT_VALIDATOR_ENGINE: 'compiled' },
          setupFiles: ['./packages/typescript/test/compiled-engine.setup.ts'],
        },
      },
    ],
  },
  plugins: [
    {
      name: 'atscript-resolve',
      enforce: 'pre',
      resolveId(id, importer) {
        if (id.endsWith('.as') && importer) {
          const dir = path.dirname(importer)
          return `${path.resolve(dir, id)}.js`
        }
      },
    },
  ],
})
