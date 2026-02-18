# Installation

## Install the Extension

1. Open VSCode
2. Go to Extensions (`Cmd+Shift+X` on macOS / `Ctrl+Shift+X` on Windows/Linux)
3. Search for **"Atscript"**
4. Install the extension by **Moost**

Alternatively, install from the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=moost.atscript-as) or via the command line:

```bash
code --install-extension moost.atscript-as
```

## Project Setup

Syntax highlighting works immediately after installation — no additional setup needed.

For LSP features (IntelliSense, diagnostics, go-to-definition, hover, rename, etc.), the extension requires `@atscript/core` to be installed in your project root:

```bash
npm install @atscript/core
```

::: tip
If `@atscript/core` is not found when the extension activates, it will show a warning and automatically retry every 60 seconds. Once you install the dependency, the language server will start on the next retry — no manual reload required.

You can also trigger an immediate restart via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) → **"Atscript: Restart Language Server"**.
:::

## What Works Without `@atscript/core`

| Feature | Without `@atscript/core` | With `@atscript/core` |
|---|---|---|
| Syntax highlighting | Yes | Yes |
| File nesting (`.as.d.ts` under `.as`) | Yes | Yes |
| IntelliSense / completions | No | Yes |
| Diagnostics | No | Yes |
| Go to Definition | No | Yes |
| Find References | No | Yes |
| Rename Symbol | No | Yes |
| Hover information | No | Yes |
| Signature help | No | Yes |
| Auto `.d.ts` generation | No | Yes |
| Config watching | No | Yes |
