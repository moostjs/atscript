# Why Atscript?

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
@mongo.collection 'users'
@meta.description 'User entity for our application'
export interface User {
    @meta.id
    @mongo.index.unique 'email_idx'
    @meta.label 'User Email'
    @meta.description 'Primary contact email'
    email: string.email

    @meta.label 'Full Name'
    @expect.minLength 2
    @expect.maxLength 100
    @mongo.index.text 5
    name: string

    @meta.label 'Age'
    @expect.min 13
    @expect.max 150
    @expect.int
    age: number

    @meta.label 'Account Status'
    @meta.documentation 'Indicates if the user can access the system'
    @mongo.index.plain 'status_idx'
    isActive: boolean
}
```

From this single definition, Atscript can generate:
- TypeScript/JavaScript types with full type safety
- Runtime validators with all constraints
- Database schemas with indexes
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
- `@mongo.*` - Database-specific configuration
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
- **Database migrations** - Generate schemas with constraints
- **Cross-platform** - Same types for backend and frontend

## Example: Before and After

### Before Atscript (Scattered)

```typescript
// types/user.ts
interface User {
    email: string
    name: string
    age: number
    isActive: boolean
}

// validation/user-schema.ts
const userSchema = z.object({
    email: z.string().email(),
    name: z.string().min(2).max(100),
    age: z.number().int().min(13).max(150),
    isActive: z.boolean()
})

// database/user.model.ts
@Entity()
class UserEntity {
    @Column({ unique: true })
    @Index()
    email: string

    @Column()
    @Index({ fulltext: true })
    name: string

    @Column('integer')
    age: number

    @Column()
    @Index()
    isActive: boolean
}

// ui/user-form-config.ts
const userFormFields = {
    email: { label: 'User Email', type: 'email' },
    name: { label: 'Full Name', minLength: 2, maxLength: 100 },
    age: { label: 'Age', type: 'number', min: 13, max: 150 },
    isActive: { label: 'Account Status', type: 'checkbox' }
}
```

### After Atscript (Unified)

```atscript
// user.as - Everything in one place!
@mongo.collection 'users'
export interface User {
    @meta.label 'User Email'
    @mongo.index.unique 'email_idx'
    email: string.email

    @meta.label 'Full Name'
    @expect.minLength 2
    @expect.maxLength 100
    @mongo.index.text 5
    name: string

    @meta.label 'Age'
    @expect.min 13
    @expect.max 150
    @expect.int
    age: number

    @meta.label 'Account Status'
    @mongo.index.plain 'status_idx'
    isActive: boolean
}
```

Then use it everywhere:
```typescript
import { User } from './user.as'

// Type checking
const user: User = { /* ... */ }

// Validation
const validator = User.validator()
validator.validate(userData)

// Access metadata for UI
User.metadata.get('meta.label') // For form labels

// Database schema is auto-generated
// Indexes are auto-created
// Documentation is auto-extracted
```

## Who Benefits from Atscript?

- **Full-stack developers** tired of maintaining duplicate schemas
- **Teams** wanting consistency across their codebase
- **Architects** designing type-safe microservices
- **Projects** with complex validation requirements
- **Applications** needing rich metadata for UI generation
- **Systems** requiring database schema synchronization

## The Vision

Atscript aims to become the universal language for data structure definition, where:
- Every programming language can consume Atscript definitions via plugins
- Complex business rules are expressed declaratively with annotations
- Type safety and validation are guaranteed across all layers
- Teams spend less time on boilerplate and more time on business logic

## Next Steps

- [Installation](/guide/installation) - Install Atscript packages
- [Quick Start](/guide/quick-start) - Create your first .as file