# URL Query Syntax

::: warning Experimental
CRUD over HTTP is experimental. APIs may change at any moment.
:::

## Overview

The CRUD endpoints parse URL query strings using [`@uniqu/url`](https://github.com/moostjs/uniqu) into the Uniquery canonical format. This page documents the full syntax for filtering, sorting, pagination, and projection via URLs.

## Comparison Operators

| URL Syntax | Operator | Example | Result |
|------------|----------|---------|--------|
| `=` | `$eq` | `status=active` | `{ status: 'active' }` |
| `!=` | `$ne` | `status!=deleted` | `{ status: { $ne: 'deleted' } }` |
| `>` | `$gt` | `age>25` | `{ age: { $gt: 25 } }` |
| `>=` | `$gte` | `age>=18` | `{ age: { $gte: 18 } }` |
| `<` | `$lt` | `price<100` | `{ price: { $lt: 100 } }` |
| `<=` | `$lte` | `price<=99` | `{ price: { $lte: 99 } }` |
| `~=` | `$regex` | `name~=/^Jo/i` | `{ name: { $regex: '/^Jo/i' } }` |

## Set Operators

### IN

```
role{Admin,Editor}
```

Result: `{ role: { $in: ['Admin', 'Editor'] } }`

### NOT IN

```
status!{Draft,Deleted}
```

Result: `{ status: { $nin: ['Draft', 'Deleted'] } }`

## Between

```
25<age<35
```

Result: `{ age: { $gt: 25, $lt: 35 } }`

```
25<=age<=35
```

Result: `{ age: { $gte: 25, $lte: 35 } }`

## Exists

```
$exists=phone,email
```

Result: `{ phone: { $exists: true }, email: { $exists: true } }`

```
$!exists=deletedAt
```

Result: `{ deletedAt: { $exists: false } }`

## Logical Operators

### AND (`&`)

```
age>=18&status=active
```

Result: `{ age: { $gte: 18 }, status: 'active' }`

### OR (`^`)

```
role=admin^role=moderator
```

Result: `{ $or: [{ role: 'admin' }, { role: 'moderator' }] }`

### Precedence

`&` binds tighter than `^`:

```
age>25^score>550&status=VIP
```

Result: `{ $or: [{ age: { $gt: 25 } }, { score: { $gt: 550 }, status: 'VIP' }] }`

### Parentheses

Override precedence with `()`:

```
(age>25^score>550)&status=VIP
```

Result: `{ $and: [{ $or: [{ age: { $gt: 25 } }, { score: { $gt: 550 } }] }, { status: 'VIP' }] }`

### NOT (`!()`)

```
!(status=deleted)
```

Result: `{ $not: { status: 'deleted' } }`

## Control Keywords

Control keywords start with `$` and configure query behavior:

| Keyword | Aliases | Example | Description |
|---------|---------|---------|-------------|
| `$select` | -- | `$select=name,email` | Include only listed fields |
| `$select` | -- | `$select=-password` | Exclude listed fields |
| `$order` | `$sort` | `$order=-createdAt,name` | Sort (prefix `-` for descending) |
| `$limit` | `$top` | `$limit=20` | Max results |
| `$skip` | -- | `$skip=40` | Skip N results |
| `$count` | -- | `$count` | Return count instead of data |
| `$search` | -- | `$search=hello world` | Full-text search term |
| `$index` | -- | `$index=my_search_idx` | Named search index |
| `$page` | -- | `$page=3` | Page number (for `/pages` endpoint) |
| `$size` | -- | `$size=25` | Items per page (for `/pages` endpoint) |
| `$with` | -- | `$with=author,comments` | Load relations ([details](#with-relation-loading)) |

### `$select` Modes

- **Include-only**: `$select=name,email` produces `['name', 'email']` (array form)
- **Exclude-only**: `$select=-password,-secret` produces `{ password: 0, secret: 0 }` (object form)

::: warning Avoid mixed mode
Mixing includes and excludes (e.g. `$select=name,-password`) produces an object map like `{ name: 1, password: 0 }`. The interpretation of mixed projection depends on the database adapter and may lead to unexpected results. Stick to **either** include-only or exclude-only in a single query.
:::

### `$order` / `$sort`

Prefix a field name with `-` for descending order:

```
$order=-createdAt,name
```

Result: `{ $sort: { createdAt: -1, name: 1 } }`

## Literal Types

| Syntax | Parsed Type | Examples |
|--------|-------------|---------|
| Bare number | `number` | `42`, `-3.14` |
| Leading zero | `string` | `007`, `00` |
| `true` / `false` | `boolean` | `flag=true` |
| `null` | `null` | `deleted=null` |
| `'quoted'` | `string` | `name='John Doe'` |
| Bare word | `string` | `status=active` |

## `$with` — Relation Loading {#with-relation-loading}

Load navigational properties declared with [`@db.rel.to` / `@db.rel.from`](./relations). Comma-separated names load multiple relations. Parentheses scope filters and controls to a specific relation.

### Basic

```
$with=author
```

Load the `author` relation for each result.

### Multiple Relations

```
$with=author,comments
```

Load both `author` and `comments`.

### Nested Relations

```
$with=posts($with=comments)
```

Load posts, and for each post load its comments.

### With Filter

```
$with=posts(status=published)
```

Only load posts where `status` is `published`.

### With Controls

```
$with=posts($sort=-createdAt&$limit=5)
```

Load the 5 most recent posts, sorted by creation date.

### Combined (Multi-Level)

```
$with=posts(status=published&$sort=-createdAt&$with=comments(body~=Great))
```

Load published posts (newest first), and for each post load comments whose body matches "Great".

### With Projection

```
$with=posts($select=title,createdAt&$with=comments($select=body))
```

Load posts with only `title` and `createdAt`, and their comments with only `body`. FK fields needed for joining are included automatically.

## Complete Examples

### Simple filter with sorting

```
GET /todos/query?completed=false&$sort=-createdAt&$limit=10
```

Find incomplete todos, newest first, max 10.

### Paginated search

```
GET /todos/pages?$search=important&$page=2&$size=20&$sort=-priority
```

Search for "important", page 2, 20 per page, sorted by priority.

### Complex filter

```
GET /users/query?age>=18&age<=30&role{Admin,Editor}&$select=id,name,email&$order=name
```

Users aged 18--30 who are Admin or Editor, include only id/name/email, sorted by name.

### Count query

```
GET /todos/query?completed=true&$count
```

Returns the count of completed todos (number, not array).

### Excluding fields

```
GET /users/query?$select=-password,-secret
```

All users, excluding password and secret fields.

### Loading relations

```
GET /posts/query?$with=author,comments&$sort=-createdAt&$limit=10
```

Latest 10 posts with author and comments loaded.

### Filtered nested relations

```
GET /users/query?$with=posts(status=published&$sort=-createdAt&$limit=5&$with=comments($limit=3))
```

All users with their 5 most recent published posts, each with up to 3 comments.

## See Also

- [CRUD over HTTP](./crud-http) -- REST endpoint reference
- [Queries & Filters](./queries) -- Programmatic filter syntax
- [Relations & Foreign Keys](./relations) -- Declaring relations in your schema
- [Customization](./crud-http-customization) -- Hooks and overrides
