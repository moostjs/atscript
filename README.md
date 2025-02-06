# Anscript

Anscript is a type-centric language designed to extend TypeScript with annotations. It introduces a `.as` file format that supports interfaces, types, and annotations (decorators starting with `@`).

## Features

- Type-safe annotation system
- Imports and exports similar to TypeScript
- VSCode extension for syntax highlighting, diagnostics, completions, and hovers
- Core parsing and AST generation
- Plugin support for extended functionalities (e.g., MongoDB integration, validation)
- Configurable `.as` file processing

## Installation

```sh
npm install -g anscript
```

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
}
```

### Configuration

Anscript allows defining a configuration file (`anscript.config.js`):

## Roadmap

- [x] VSCode extension (syntax highlighting, diagnostics, completions)
- [x] Core parsing and AST generation
- [x] Watch for config file changes
- [x] Generate `.d.ts` files from `.as` files
- [x] Generate TypeScript classes from interfaces
- [x] Plugin system
- [x] Basic Validations
- [-] MongoDB Integration
- [ ] Advanced Validations

## License

MIT
