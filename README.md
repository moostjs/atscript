# Atscript - Annotate Things

<p style="text-align: center;">
<img src="https://raw.githubusercontent.com/moostjs/atscript/main/packages/vscode/icons/as-logo.svg" alt="Atscript Demo" width="256">
</p>

Atscript is a type-centric language designed to extend TypeScript with annotations. It introduces a `.as` file format that supports interfaces, types, and annotations (decorators starting with `@`).

## Features

- Type-safe annotation system
- Imports and exports similar to TypeScript
- VSCode extension for syntax highlighting, diagnostics, completions, and hovers
- Core parsing and AST generation
- Plugin support for extended functionalities (e.g., MongoDB integration, validation)
- Configurable `.as` file processing

## Usage

You can define types and interfaces with annotations in `.as` files:

```typescript
@mongo.collection 'users'
export interface User {
    @label 'User ID'
    id: string

    @label 'User Name'
    name: string

    @label 'Email'
    email: string

    @expect.min 18
    age: number.int
}
```

### Configuration

Atscript allows defining a configuration file (`atscript.config.js`):

## Roadmap

- [x] VSCode extension (syntax highlighting, diagnostics, completions)
- [x] Core parsing and AST generation
- [x] Watch for config file changes
- [x] Generate `.d.ts` files from `.as` files
- [x] Generate TypeScript classes from interfaces
- [x] Plugin system
- [x] Basic Validations
- [x] MongoDB Sync Index

## License

MIT
