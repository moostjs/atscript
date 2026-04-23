# Quick Start

A practical first run for app developers evaluating Atscript.

::: tip What You Will Build
In this guide, you will:

1. define one `.as` model
2. generate the TypeScript and runtime files Atscript needs
3. validate invalid input against that model
4. wire Atscript into a real build once the basics make sense
   :::

::: info Current Scope
Atscript is language-agnostic by design, but TypeScript is the first supported target today. If you are evaluating Atscript right now, this is the best place to start.
:::

## Phase 1: Prove The Workflow

### 1. Install Packages

```bash
npm install @atscript/typescript
npm install -D @atscript/core
```

`@atscript/typescript` ships the runtime utilities you will use from application code. `@atscript/core` provides the compiler and plugin foundation at build time.

### 2. Create A `.as` File

Create `src/user.as`:

```atscript
export interface User {
    @meta.label 'User Name'
    @expect.minLength 2
    name: string

    @meta.label 'Email Address'
    email: string.email

    @expect.min 0
    age: number.int
}
```

This file already contains:

- the data shape
- validation rules
- metadata that runtime tools can read later

### 3. Add A Minimal Config

Create `atscript.config.js` in your project root:

```javascript
import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts()],
})
```

For this quick start, the default TypeScript plugin is enough.

### 4. Generate The Files Atscript Uses

Run:

```bash
npx asc -f dts
npx asc -f js
```

This gives you:

- `src/user.as.d.ts` for TypeScript and editor support
- `src/user.as.js` for runtime use
- `atscript.d.ts` for typed annotation keys in your project

Add `atscript.d.ts` to your `tsconfig.json`:

```json
{
  "include": ["src/**/*", "atscript.d.ts"]
}
```

### 5. Try The Runtime In One Small Script

Create `src/demo.mjs`:

```javascript
import { User } from './user.as.js'

const validator = User.validator()

const input = {
  name: 'A',
  email: 'not-an-email',
  age: -5,
}

if (validator.validate(input, true)) {
  console.log('Valid user:', input)
} else {
  console.log('Validation errors:')
  for (const err of validator.errors) {
    console.log(`- ${err.path}: ${err.message}`)
  }
}
```

Run it:

```bash
node src/demo.mjs
```

Expected output:

```text
Validation errors:
- name: Expected minimum length 2
- email: Expected valid email
- age: Expected minimum value 0
```

At this point you have already proven the core Atscript workflow:

- define the model once
- generate runtime and type files
- validate data from that model

### 6. Use The Model In TypeScript

Once `src/user.as.d.ts` exists, your TypeScript code can import from `./user.as`:

```typescript
import { User } from './user.as'

const user: User = {
  name: 'Ada',
  email: 'ada@example.com',
  age: 28,
}

const validator = User.validator()
const emailProp = User.type.props.get('email')

console.log(emailProp?.metadata.get('meta.label'))
validator.validate(user)
```

Use `./user.as.js` when you want to run the generated JavaScript directly without a bundler. Use `./user.as` in TypeScript source once the declaration file exists and your app build knows how to compile the `.as` runtime file.

## Phase 2: Integrate Atscript Into Your Build

Once the CLI flow makes sense, add Atscript to your normal app build so you do not need to run `asc -f js` by hand.

Install the bundler plugin:

```bash
npm install -D unplugin-atscript
```

Vite example:

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import atscript from 'unplugin-atscript/vite'

export default defineConfig({
  plugins: [atscript()],
})
```

Now your app code can import `.as` files directly and let the build handle compilation.

See [Build Setup](/packages/typescript/build-setup) for Rollup, esbuild, Webpack, Rspack, and more.

## Optional But Helpful

- Install the [Atscript VSCode extension](https://marketplace.visualstudio.com/items?itemName=moost.atscript-as) for syntax highlighting, diagnostics, and automatic `.as.d.ts` generation on save
- Read [Imports & Exports](/packages/typescript/imports-exports) if you want a clearer picture of how `.as`, `.as.d.ts`, and `.as.js` fit together

## Next Steps

- [Build Setup](/packages/typescript/build-setup) — integrate Atscript into your real app build
- [Validation Guide](/packages/typescript/validation) — common validation tasks in application code
- [Interfaces & Types](/packages/typescript/interfaces-types) — the core `.as` syntax
- [Annotations Guide](/packages/typescript/annotations) — practical metadata and validation annotations
