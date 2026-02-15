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

## Installing Dependencies

::: danger Important — Read This
The Atscript extension **does not bundle** its core dependency (`@atscript/core`). This package includes native platform-specific binaries that cannot be shipped inside the `.vsix` file. **You must install it separately** for full functionality.

Without this dependency, **only syntax highlighting will work**. IntelliSense, diagnostics, go-to-definition, and all other language features require `@atscript/core` to be installed.
:::

### Automatic Installation

When the extension activates for the first time, it will:

1. Check if `@atscript/core` is already available (locally in the extension directory or globally)
2. If not found, attempt to install it automatically using a detected package manager (`pnpm`, `yarn`, or `npm`)
3. Show a notification: *"Atscript: Installing dependencies..."*
4. On success: *"Atscript: Dependencies installed successfully."*

If everything goes well, no further action is needed.

### Manual Installation

If automatic installation fails (e.g., due to network restrictions, permissions, or missing package managers), the extension will show an error notification with two options:

**Option 1 — Install locally in the extension directory:**

```bash
cd ~/.vscode/extensions/moost.atscript-as-<version> && npm install --omit=dev
```

**Option 2 — Install globally:**

```bash
npm install -g @atscript/core
```

::: tip
The error notification includes **"Copy local install command"** and **"Copy global install command"** buttons that provide the exact commands with the correct paths for your system.
:::

### Extension Paths by Platform

If you need to find the extension directory manually:

| Platform | Path |
|---|---|
| macOS | `~/.vscode/extensions/moost.atscript-as-<version>` |
| Linux | `~/.vscode/extensions/moost.atscript-as-<version>` |
| Windows | `%USERPROFILE%\.vscode\extensions\moost.atscript-as-<version>` |

Replace `<version>` with the installed version number (e.g., `0.1.2`).

### Verifying Installation

After manual installation, the extension will detect the dependencies automatically within 60 seconds. You can also reload the VSCode window (`Cmd+Shift+P` → "Developer: Reload Window") to trigger immediate detection.

When the language server is running, you'll see IntelliSense suggestions and diagnostics in your `.as` files.
