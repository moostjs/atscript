# Build Setup

Integrate Atscript into your build process using `unplugin-atscript`. This plugin automatically compiles `.as` files during the build process using your [configuration file](/guide/configuration).

## Installation

```bash
npm install -D unplugin-atscript
```

## Bundler Integration

`unplugin-atscript` supports multiple build tools. The plugin automatically reads your `atscript.config.js` file and applies all configured plugins and settings.

### Vite

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import atscript from 'unplugin-atscript'

export default defineConfig({
  plugins: [atscript.vite()],
})
```

### Rollup

```javascript
// rollup.config.js
import atscript from 'unplugin-atscript'

export default {
  plugins: [atscript.rollup()],
}
```

### esbuild

```javascript
// build.js
import { build } from 'esbuild'
import atscript from 'unplugin-atscript'

build({
  plugins: [atscript.esbuild()],
  entryPoints: ['src/index.ts'],
  bundle: true,
  outdir: 'dist',
})
```

### Rolldown

```javascript
// rolldown.config.js
import atscript from 'unplugin-atscript'

export default {
  plugins: [atscript.rolldown()],
}
```

## How It Works

1. **Config Discovery**: The plugin finds your `atscript.config.js` by searching upward from each `.as` file location
2. **Plugin Execution**: Runs all plugins defined in your configuration
3. **File Generation**: Generates output based on what the bundler needs (ignores `format` setting)
4. **Import Resolution**: Allows importing `.as` files directly in your TypeScript/JavaScript code

## Development vs Production

The plugin works seamlessly in both development and production:

- **Development**: Compiles on-demand with hot module replacement
- **Production**: Pre-compiles during build for optimal performance

## Next Steps

- [Quick Start](/guide/quick-start) - Review complete setup
- [Interfaces & Types](/guide/interfaces-types) - Start building with Atscript
