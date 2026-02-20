# Testing Plugins

Testing is essential for Atscript plugins — you need to verify that primitives register correctly, annotations validate as expected, and code generation produces the right output. This page covers the standard testing patterns using Vitest.

## Test Setup

Install the test dependencies:

```bash
npm install -D vitest @atscript/core
```

Configure Vitest in your package's `vitest.config.ts` (or use the workspace config if you're in the Atscript monorepo):

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
  },
})
```

## The build() + generate() Pattern

The standard test pattern creates a build from fixture files and verifies the output:

```typescript
import path from 'path'
import { build, AnnotationSpec } from '@atscript/core'
import { describe, expect, it } from 'vitest'
import { myPlugin } from './plugin'

const wd = path.join(path.dirname(import.meta.url.slice(7)), '..')

describe('my-plugin', () => {
  it('should render interface', async () => {
    const repo = await build({
      rootDir: wd,
      entries: ['test/fixtures/basic.as'],
      plugins: [myPlugin()],
    })

    const out = await repo.generate({ format: 'myformat' })

    expect(out).toHaveLength(1)
    expect(out[0].fileName).toBe('basic.as.ext')
    expect(out[0].content).toContain('class User')
  })
})
```

### How It Works

1. `build()` creates an `AtscriptRepo`, opens and parses all `.as` files listed in `entries`
2. `repo.generate({ format })` calls `render(doc, format)` for each document, collecting all output
3. You assert on the output array — file count, file names, and content

### Registering Test Annotations

If your fixtures use annotations, register them in the `build()` config:

```typescript
const annotations = {
  label: new AnnotationSpec({
    argument: { name: 'value', type: 'string' },
  }),
  tag: new AnnotationSpec({
    multiple: true,
    mergeStrategy: 'append',
    argument: { name: 'value', type: 'string' },
  }),
}

const repo = await build({
  rootDir: wd,
  entries: ['test/fixtures/annotated.as'],
  plugins: [myPlugin()],
  annotations,
})
```

## Snapshot Testing

For code generation, snapshot tests are the most effective approach — they catch any unexpected change in the generated output.

### Using toMatchFileSnapshot()

Vitest's `toMatchFileSnapshot()` stores each snapshot as a separate file, making diffs easy to review:

```typescript
it('should generate correct output', async () => {
  const repo = await build({
    rootDir: wd,
    entries: ['test/fixtures/interface.as'],
    plugins: [myPlugin()],
    annotations,
  })

  const out = await repo.generate({ format: 'myformat' })

  await expect(out[0].content).toMatchFileSnapshot(
    path.join(wd, 'test/__snapshots__/interface.ext')
  )
})
```

On the first run, the snapshot file is created. On subsequent runs, the output is compared against the saved snapshot.

### Updating Snapshots

When you intentionally change the code generator, update snapshots with:

```bash
vitest run -u
```

### Organizing Snapshots

A clean directory layout keeps fixtures and snapshots organized:

```
test/
  fixtures/
    interface.as
    type.as
    imports.as
  __snapshots__/
    interface.ext
    type.ext
    imports.ext
```

Each fixture has a corresponding snapshot file. This makes it easy to review generated output by simply opening the snapshot file.

## Testing Annotations

### Verifying Registration

Test that your plugin's `config()` hook registers the expected primitives and annotations:

```typescript
import { PluginManager } from '@atscript/core'
import { myPlugin } from './plugin'

it('should register primitives', async () => {
  const manager = new PluginManager({
    plugins: [myPlugin()],
  })
  const docConfig = await manager.getDocConfig()

  expect(docConfig.primitives?.has('geo')).toBe(true)
  expect(docConfig.primitives?.get('geo')?.children?.has('latitude')).toBe(true)
})
```

### Verifying Annotation Behavior

Test that annotations produce correct metadata in the generated output:

```typescript
it('should emit annotation metadata', async () => {
  const repo = await build({
    rootDir: wd,
    entries: ['test/fixtures/annotated.as'],
    plugins: [myPlugin()],
    annotations: {
      label: new AnnotationSpec({
        argument: { name: 'value', type: 'string' },
      }),
    },
  })

  const out = await repo.generate({ format: 'myformat' })
  expect(out[0].content).toContain('label')
  expect(out[0].content).toContain('Full Name')
})
```

## Testing Diagnostics

Diagnostics are error and warning messages from annotation validation. Test them using `repo.diagnostics()`:

```typescript
it('should report error for invalid annotation target', async () => {
  const repo = await build({
    rootDir: wd,
    entries: ['test/fixtures/invalid-annotation.as'],
    plugins: [myPlugin()],
  })

  const diagnostics = await repo.diagnostics()

  // diagnostics is a Map<docId, TMessages>
  const [, messages] = [...diagnostics.entries()][0]
  expect(messages.length).toBeGreaterThan(0)
  expect(messages[0].severity).toBe(1)  // 1 = Error
  expect(messages[0].message).toContain('only valid on')
})
```

### Testing Valid Files Have No Errors

```typescript
it('should have no diagnostics for valid file', async () => {
  const repo = await build({
    rootDir: wd,
    entries: ['test/fixtures/valid.as'],
    plugins: [myPlugin()],
  })

  const diagnostics = await repo.diagnostics()
  const [, messages] = [...diagnostics.entries()][0]
  expect(messages.filter(m => m.severity === 1)).toHaveLength(0)
})
```

## Fixture File Best Practices

### Keep Fixtures Small and Focused

Each fixture should test one concept:

```atscript
// test/fixtures/basic-interface.as
export interface User {
    name: string
    email: string.email
}
```

```atscript
// test/fixtures/optional-fields.as
export interface Settings {
    theme?: string
    language?: string
    notifications: boolean
}
```

```atscript
// test/fixtures/with-annotations.as
export interface Product {
    @label "Product Name"
    @expect.minLength 1
    name: string.required

    @label "Price"
    @expect.min 0
    price: number
}
```

### Test Edge Cases Separately

Create dedicated fixtures for:
- Empty interfaces
- Type aliases (simple, union, intersection)
- Nested structures (inline objects)
- Array types
- Import/export chains
- Annotate blocks (mutating and non-mutating)
- Phantom types

### Store Fixtures Alongside Source

```
src/
  plugin.ts
  plugin.spec.ts
test/
  fixtures/
    basic.as
    annotations.as
    imports.as
  __snapshots__/
    basic.ext
    annotations.ext
    imports.ext
```

## Testing Multiple Formats

If your plugin supports multiple formats, test each format separately:

```typescript
it('should generate types', async () => {
  const repo = await build({
    rootDir: wd,
    entries: ['test/fixtures/user.as'],
    plugins: [myPlugin()],
  })

  const types = await repo.generate({ format: 'types' })
  await expect(types[0].content).toMatchFileSnapshot(
    path.join(wd, 'test/__snapshots__/user.types.out')
  )

  const runtime = await repo.generate({ format: 'runtime' })
  await expect(runtime[0].content).toMatchFileSnapshot(
    path.join(wd, 'test/__snapshots__/user.runtime.out')
  )
})
```

## Testing buildEnd Output

The `buildEnd` hook adds files to the output array. Test it by checking for extra files:

```typescript
it('should generate index file via buildEnd', async () => {
  const repo = await build({
    rootDir: wd,
    entries: ['test/fixtures/user.as', 'test/fixtures/post.as'],
    plugins: [myPlugin()],
  })

  const out = await repo.generate({ format: 'myformat' })

  // buildEnd should have added an extra file
  const indexFile = out.find(o => o.fileName === 'index.generated.ext')
  expect(indexFile).toBeDefined()
  expect(indexFile!.content).toContain('user')
  expect(indexFile!.content).toContain('post')
})
```

## Next Steps

- [VSCode & Build Integration](/plugin-development/tooling-integration) — deploy your tested plugin into the toolchain
- [Building a Code Generator](/plugin-development/code-generation) — the code generation patterns being tested
