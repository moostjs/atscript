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
    @meta.id
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

From this single definition, Atscript can already drive several parts of your stack today, and it is designed to expand further from the same model over time.

## What Atscript Gives You Today

- TypeScript types with full type safety
- Runtime validators with model-defined constraints
- JSON Schema and runtime metadata export
- Database annotations and integrations via [Database Layer](https://db.atscript.dev/guide/)
- REST/CRUD integrations in the TypeScript ecosystem

## Where the Model Is Going

Atscript is growing toward a wider model-driven workflow where the same `.as` definition can shape:

- UI form tools
- Table and list tools
- API contracts and integrations
- TypeScript code
- Database schema and operations

The direction is one model across the full data flow, while keeping the current docs precise about what is already available and what is planned next.

## Core Design Principles

### 1. One Model Across the Stack

- Keep structure, validation, metadata, and data-layer hints in one place
- Make the model the source of truth instead of generating more duplicated config
- Grow capabilities outward from the same definition instead of creating new parallel schemas

### 2. Everything Is Extensible

- **Types are extensible**: Create semantic types like `string.email`, `number.positive`
- **Annotations are extensible**: Add any metadata your project needs
- **Plugins are powerful**: Generate code for any language or framework

### 3. Annotations for Everything

Atscript uses annotations to attach any kind of metadata:

- `@meta.*` - Human-readable information
- `@expect.*` - Validation constraints
- `@db.*` - Database configuration (tables, indexes, columns, defaults)
- `@your.custom` - Whatever your project needs

### 4. Language-Agnostic by Design

The core model and plugin system are built so Atscript can be adopted by different language targets over time. Today, TypeScript is the first supported plugin and the most complete workflow.

- Clean, TypeScript-like syntax keeps the model easy to read
- The plugin system allows other languages to adopt the same model pattern
- Future language targets can build on the same core concepts instead of reinventing the schema

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

## Who Benefits from Atscript Today?

- **TypeScript backend and full-stack teams** tired of maintaining duplicate schemas
- **Projects** with validation, metadata, and DB rules spread across multiple files
- **Teams** that want one source of truth today and a more model-driven stack over time
