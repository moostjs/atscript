---
outline: deep
---

# URL Query Syntax

The HTTP controllers (`AsDbController` and `AsDbReadableController`) accept a rich URL query syntax for filtering, sorting, pagination, and relation loading — powered by [`@uniqu/url`](https://github.com/moostjs/uniqu). Filters and controls are encoded directly into the query string using a compact, expressive format that all database adapters understand.

## Basic Filtering

Filter records by matching field values. Multiple conditions are combined with `&` (AND):

```
GET /query?status=active
GET /query?status=active&priority=high
```

## Comparison Operators

Compare fields against values using inline operators:

```
?status!=done          # not equal
?priority>3            # greater than
?priority>=3           # greater than or equal
?priority<5            # less than
?priority<=5           # less than or equal
```

These work with numeric fields, dates, and any comparable type supported by the adapter.

## Set Operators

Match against a set of values using curly braces:

```
?role{Admin,Editor}     # IN (role is Admin or Editor)
?status!{Draft,Deleted} # NOT IN
```

The IN operator matches records where the field equals any value in the comma-separated list. NOT IN excludes records matching any value in the set.

## Range (Between)

Filter a field within a numeric or date range:

```
?25<age<35             # exclusive range
?25<=age<=35           # inclusive range
```

The value is placed between two bounds. Mix `<` and `<=` as needed (e.g., `25<=age<35`).

## Pattern Matching

Match a field against a regular expression:

```
?name~=/^Al/i          # regex match
```

The pattern follows `/pattern/flags` format. Common flags include `i` (case-insensitive). Regex support depends on the database adapter — MongoDB supports full PCRE, while SQLite uses `LIKE`-based approximation for simple patterns.

## Existence

Check whether fields are present (non-null) or absent (null):

```
?$exists=email,phone   # fields must exist (not null)
?$!exists=deletedAt    # field must not exist (is null)
```

Multiple fields can be comma-separated. A field "exists" when its value is not null.

## Null Values

Explicitly match null values:

```
?assigneeId=null       # field is null
```

The literal `null` is parsed as a null value, not the string `"null"`.

## Logical Operators

Combine conditions with AND, OR, NOT, and grouping:

```
?status=todo&priority=high               # AND (tighter binding)
?status=done^priority=low                # OR (looser binding)
?(status=todo^status=in_progress)        # grouped OR
?!(status=done)                          # NOT
```

**Operator precedence:** `&` (AND) binds tighter than `^` (OR). This means:

```
?status=done^priority=high&role=admin
```

is interpreted as:

```
status=done  OR  (priority=high AND role=admin)
```

Use parentheses to override default precedence:

```
?(status=todo^status=in_progress)&priority=high
```

This matches records where status is `todo` or `in_progress`, **and** priority is `high`.

## Control Keywords {#control-keywords}

Special `$`-prefixed parameters configure query behavior rather than filtering data.

### Projection (`$select`)

Control which fields are returned:

```
?$select=id,title,status           # include only these fields
?$select=-password,-secret         # exclude these fields
```

**Include mode** returns only the listed fields. **Exclude mode** (prefix with `-`) returns all fields except the listed ones.

::: warning Avoid mixed mode
Mixing includes and excludes (e.g., `$select=name,-password`) produces unpredictable results depending on the adapter. Use either include-only or exclude-only.
:::

### Sorting (`$sort`)

Order results by one or more fields:

```
?$sort=name                        # ascending
?$sort=-createdAt                  # descending (prefix -)
?$sort=status,-priority            # multi-field sort
```

Fields are comma-separated. Prefix a field with `-` for descending order.

### Pagination — Offset-Based (for `/query`)

Use `$limit` and `$skip` for offset-based pagination:

```
?$limit=20                         # max records
?$skip=40                          # offset
```

### Pagination — Page-Based (for `/pages`)

Use `$page` and `$size` for page-based pagination:

```
?$page=2&$size=10                  # page number + page size
```

Pages are 1-based. The `/pages` endpoint returns paginated results with metadata (total count, page info).

### Count (`$count`)

Return only the count of matching records, without data:

```
?$count                            # return count instead of data
```

### Search (`$search`)

Perform full-text search:

```
?$search=mongodb tutorial          # fulltext search
?$index=product_search             # named search index
```

Full-text search support and behavior depends on the adapter. MongoDB supports Atlas Search with named indexes; SQLite uses FTS5 when available.

## Relation Loading (`$with`) {#with-relation-loading}

Load related data inline by specifying navigational relations declared with `@db.rel.to`, `@db.rel.from`, or `@db.rel.via` in your schema.

**Single relation:**

```
?$with=author                              # single relation
```

**Multiple relations:**

```
?$with=author,comments                     # multiple relations
```

**With controls** — apply sorting, limits, or other controls to a specific relation using parentheses:

```
?$with=posts($limit=5&$sort=-createdAt)    # with controls
```

**Nested relations** — load relations of relations:

```
?$with=posts($with=comments)               # nested relations
```

**Filtered with nested** — combine filters, controls, and nesting inside parentheses:

```
?$with=posts(status=published&$with=comments($limit=3))  # filtered + nested
```

Parentheses contain a sub-query for the relation. All filter and control syntax described on this page works inside relation sub-queries.

::: tip FK fields auto-included
When using `$select` alongside `$with`, foreign key fields needed for joining are automatically included — even if not explicitly listed or explicitly excluded. This ensures relations resolve correctly.
:::

## Comprehensive Examples

**Simple list** — active items, sorted by recency, limited to 10:

```
GET /query?status=active&$sort=-createdAt&$limit=10
```

**Paginated with search** — full-text search with page-based pagination:

```
GET /pages?$search=typescript&$page=1&$size=20&$sort=-relevance
```

**Complex filtered with relations** — high-priority incomplete tasks with projection and relations:

```
GET /query?status!=done&priority>=3&$select=id,title,status&$with=assignee,tags&$sort=-priority,title&$limit=50
```

**Nested relation loading** — projects and comments with their own projections and controls:

```
GET /query?$with=project($select=id,title),comments($sort=-createdAt&$limit=5&$with=author($select=name))
```

**Count with filter** — count completed tasks without returning data:

```
GET /query?completed=true&$count
```

**Excluding sensitive fields:**

```
GET /query?$select=-password,-secret,-internalNotes
```

## Next Steps

- [Customization & Hooks](./crud-http-customization) — Interceptors and overrides
- [HTTP Controllers](./crud-http) — REST endpoint reference and setup
- [Queries & Filters](./queries) — Programmatic query API (non-HTTP)
