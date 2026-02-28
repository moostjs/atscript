## The Problem: Scattered Data Definitions

In modern software projects, especially business applications, data structure definitions are scattered across multiple layers and files:

- **Type definitions** in your programming language (TypeScript interfaces, Go structs, Java classes)
- **Validation rules** in separate validation libraries or schemas
- **Database constraints** in migration files or ORM configurations
- **UI metadata** like labels and descriptions in frontend components
- **API documentation** in OpenAPI/Swagger files
- **Database indexes** in database-specific DDL scripts

This scattering leads to:

- **Duplication** - The same information repeated in different formats
- **Inconsistency** - Changes in one place not reflected in others
- **Maintenance burden** - Multiple files to update for a single change
- **No single source of truth** - Unclear which definition is authoritative

## The Solution: Unified Data Definition

Atscript brings order to this chaos by providing a single place to define:

```atscript
@db.table 'users'
@meta.description 'User entity for our application'
export interface User {
    @db.id
    @db.index.unique 'email_idx'
    @meta.label 'User Email'
    @meta.description 'Primary contact email'
    email: string.email

    @meta.label 'Full Name'
    @expect.minLength 2
    @expect.maxLength 100
    @db.index.fulltext 'search_idx'
    name: string

    @meta.label 'Age'
    @expect.min 13
    @expect.max 150
    @expect.int
    age: number

    @meta.label 'Account Status'
    @meta.documentation 'Indicates if the user can access the system'
    @db.index.plain 'status_idx'
    isActive: boolean
}
```

From this single definition, Atscript generates:

- Types with full type safety in your target language
- Runtime validators with all constraints
- Database tables with indexes via the [DB abstraction layer](/db-support/)
- JSON Schema for API documentation
- UI metadata for form generation
- And more via the plugin system

## Core Design Principles

### 1. Everything is Extensible

- **Types are extensible**: Create semantic types like `string.email`, `number.positive`
- **Annotations are extensible**: Add any metadata your project needs
- **Plugins are powerful**: Generate code for any language or framework

### 2. Annotations for Everything

Atscript uses annotations to attach any kind of metadata:

- `@meta.*` - Human-readable information
- `@expect.*` - Validation constraints
- `@db.*` - Database configuration (tables, indexes, columns, defaults)
- `@your.custom` - Whatever your project needs

### 3. Language Agnostic

While currently supporting TypeScript/JavaScript, Atscript is designed to be universal:

- Clean, TypeScript-like syntax that's familiar
- Plugin system allows any language to be targeted
- Community can contribute plugins for Python, Go, Rust, etc.

## Real-World Benefits

### For Development Teams

- **Single source of truth** - One place to define data structures
- **Consistency guaranteed** - All layers use the same definitions
- **Faster development** - No need to maintain multiple schemas
- **Type safety everywhere** - From database to UI

### For Business Logic

- **Business rules in one place** - Validation constraints with the data
- **Self-documenting** - Metadata makes code more readable
- **Audit-friendly** - Clear data governance and constraints

### For System Architecture

- **Microservices contracts** - Share types between services
- **API-first design** - Generate OpenAPI from types
- **Database from annotations** - Tables, indexes, and CRUD from `@db.*` annotations
- **Cross-platform** - Same types for backend and frontend

## Who Benefits from Atscript?

- **Full-stack developers** tired of maintaining duplicate schemas
- **Teams** wanting consistency across their codebase
- **Architects** designing type-safe microservices
- **Projects** with complex validation requirements
- **Applications** needing rich metadata for UI generation
- **Systems** requiring database schema synchronization
