// eslint-disable max-lines
import type { TAnnotationsTree, TMessages } from '@atscript/core'
import {
  AnnotationSpec,
  isInterface,
  isStructure,
  isRef,
  isPrimitive,
  isArray,
} from '@atscript/core'

const analyzers = [
  'lucene.standard',
  'lucene.simple',
  'lucene.whitespace',
  'lucene.english',
  'lucene.french',
  'lucene.german',
  'lucene.italian',
  'lucene.portuguese',
  'lucene.spanish',
  'lucene.chinese',
  'lucene.hindi',
  'lucene.bengali',
  'lucene.russian',
  'lucene.arabic',
]

/**
 * MongoDB-specific annotations.
 *
 * Merged into the global config under `{ db: { mongo: ... } }` so they
 * live alongside core's `@db.table`, `@db.index.*`, etc.
 *
 * Annotations removed (now in core):
 * - `@mongo.index.plain` → use `@db.index.plain`
 * - `@mongo.index.unique` → use `@db.index.unique`
 */
export const annotations: TAnnotationsTree = {
  collection: new AnnotationSpec({
    description:
      'Marks an interface as a **MongoDB collection**.\n\n' +
      '- Use together with `@db.table "name"` which provides the collection name.\n' +
      '- Automatically injects a **non-optional** `_id` field if not explicitly defined.\n' +
      '- `_id` must be of type **`string`**, **`number`**, or **`mongo.objectId`**.\n\n' +
      '**Example:**\n' +
      '```atscript\n' +
      '@db.table "users"\n' +
      '@db.mongo.collection\n' +
      'export interface User {\n' +
      '    _id: mongo.objectId\n' +
      '    email: string.email\n' +
      '}\n' +
      '```\n',
    nodeType: ['interface'],
    validate(token, args, doc) {
      const parent = token.parentNode
      const struc = parent?.getDefinition()
      const errors = [] as TMessages
      if (isInterface(parent) && parent.props.has('_id') && isStructure(struc)) {
        const _id = parent.props.get('_id')!
        const isOptional = !!_id.token('optional')
        if (isOptional) {
          errors.push({
            message: `[db.mongo] _id can't be optional in Mongo Collection`,
            severity: 1,
            range: _id.token('identifier')!.range,
          })
        }
        const definition = _id.getDefinition()
        if (!definition) {
          return errors
        }
        let wrongType = false
        if (isRef(definition)) {
          const def = doc.unwindType(definition.id!, definition.chain)?.def
          if (isPrimitive(def) && !['string', 'number'].includes(def.config.type as string)) {
            wrongType = true
          }
        } else {
          wrongType = true
        }
        if (wrongType) {
          errors.push({
            message: `[db.mongo] _id must be of type string, number or mongo.objectId`,
            severity: 1,
            range: _id.token('identifier')!.range,
          })
        }
      }
      return errors
    },
    modify(token, args, doc) {
      // add _id property if not exists
      const parent = token.parentNode
      const struc = parent?.getDefinition()
      if (isInterface(parent) && !parent.props.has('_id') && isStructure(struc)) {
        struc.addVirtualProp({
          name: '_id',
          type: 'mongo.objectId',
          documentation: 'Mongodb Primary Key ObjectId',
        })
      }
    },
  }),

  autoIndexes: new AnnotationSpec({
    description:
      'Switch on/off the automatic index creation. Works with as-mongo moost controller.\n\nDefault: true',
    nodeType: ['interface'],
    argument: {
      name: 'type',
      type: 'boolean',
      description: 'On/Off the automatic index creation',
    },
  }),

  index: {
    text: new AnnotationSpec({
      description:
        'Creates a **legacy MongoDB text index** for full-text search with optional **weight** specification.\n\n' +
        'Use this when you need per-field weight control. For simple full-text indexing without ' +
        'weights, use the generic `@db.index.fulltext` instead.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.mongo.index.text 5\n' +
        'bio: string\n' +
        '```\n',
      nodeType: ['prop'],
      argument: {
        optional: true,
        name: 'weight',
        type: 'number',
        description:
          'Field importance in search results (higher = more relevant). Defaults to `1`.',
      },
    }),
  },

  search: {
    dynamic: new AnnotationSpec({
      description:
        'Creates a **dynamic MongoDB Search Index** that applies to the entire collection.\n\n' +
        '- **Indexes all text fields automatically** (no need to specify fields).\n' +
        '- Supports **language analyzers** for text tokenization.\n' +
        '- Enables **fuzzy search** (typo tolerance) if needed.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.mongo.search.dynamic "lucene.english", 1\n' +
        'export interface MongoCollection {}\n' +
        '```\n',
      nodeType: ['interface'],
      multiple: false,
      argument: [
        {
          optional: true,
          name: 'analyzer',
          type: 'string',
          description:
            'The **text analyzer** for tokenization. Defaults to `"lucene.standard"`.\n\n' +
            '**Available options:** `"lucene.standard"`, `"lucene.english"`, `"lucene.spanish"`, etc.',
          values: analyzers,
        },
        {
          optional: true,
          name: 'fuzzy',
          type: 'number',
          description:
            'Maximum typo tolerance (`0-2`). Defaults to `0` (no fuzzy search).\n\n' +
            '- `0` → Exact match required.\n' +
            '- `1` → Allows small typos (e.g., `"mongo"` ≈ `"mango"`).\n' +
            '- `2` → More typo tolerance (e.g., `"mongodb"` ≈ `"mangodb"`).',
        },
      ],
    }),

    static: new AnnotationSpec({
      description:
        'Defines a **MongoDB Atlas Search Index** for the collection. The props can refer to this index using `@db.mongo.search.text` annotation.\n\n' +
        '- **Creates a named search index** for full-text search.\n' +
        '- **Specify analyzers and fuzzy search** behavior at the index level.\n' +
        '- **Fields must explicitly use `@db.mongo.search.text`** to be included in this search index.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.mongo.search.static "lucene.english", 1, "mySearchIndex"\n' +
        'export interface MongoCollection {}\n' +
        '```\n',
      nodeType: ['interface'],
      multiple: true,
      argument: [
        {
          optional: true,
          name: 'analyzer',
          type: 'string',
          description:
            'The text analyzer for tokenization. Defaults to `"lucene.standard"`.\n\n' +
            '**Available options:** `"lucene.standard"`, `"lucene.english"`, `"lucene.spanish"`, `"lucene.german"`, etc.',
          values: analyzers,
        },
        {
          optional: true,
          name: 'fuzzy',
          type: 'number',
          description:
            'Maximum typo tolerance (`0-2`). **Defaults to `0` (no fuzzy matching).**\n\n' +
            '- `0` → No typos allowed (exact match required).\n' +
            '- `1` → Allows small typos (e.g., "mongo" ≈ "mango").\n' +
            '- `2` → More typo tolerance (e.g., "mongodb" ≈ "mangodb").',
        },
        {
          optional: true,
          name: 'indexName',
          type: 'string',
          description:
            'The name of the search index. Fields must reference this name using `@db.mongo.search.text`. If not set, defaults to `"DEFAULT"`.',
        },
      ],
    }),

    text: new AnnotationSpec({
      description:
        'Marks a field to be **included in a MongoDB Atlas Search Index** defined by `@db.mongo.search.static`.\n\n' +
        '- **The field has to reference an existing search index name**.\n' +
        '- If index name is not defined, a new search index with default attributes will be created.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.mongo.search.text "lucene.english", "mySearchIndex"\n' +
        'firstName: string\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: true,
      argument: [
        {
          optional: true,
          name: 'analyzer',
          type: 'string',
          description:
            'The text analyzer for tokenization. Defaults to `"lucene.standard"`.\n\n' +
            '**Available options:** `"lucene.standard"`, `"lucene.english"`, `"lucene.spanish"`, `"lucene.german"`, etc.',
          values: analyzers,
        },
        {
          optional: true,
          name: 'indexName',
          type: 'string',
          description:
            'The **name of the search index** defined in `@db.mongo.search.static`. This links the field to the correct index. If not set, defaults to `"DEFAULT"`.',
        },
      ],
    }),

    vector: new AnnotationSpec({
      description:
        'Creates a **MongoDB Vector Search Index** for **semantic search, embeddings, and AI-powered search**.\n\n' +
        '- Each field that stores vector embeddings **must define its own vector index**.\n' +
        '- Supports **cosine similarity, Euclidean distance, and dot product similarity**.\n' +
        '- Vector fields must be an **array of numbers**.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.mongo.search.vector 512, "cosine"\n' +
        'embedding: mongo.vector\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: false,
      argument: [
        {
          optional: false,
          name: 'dimensions',
          type: 'number',
          description:
            'The **number of dimensions in the vector** (e.g., 512 for OpenAI embeddings).',
          values: ['512', '768', '1024', '1536', '3072', '4096'],
        },
        {
          optional: true,
          name: 'similarity',
          type: 'string',
          description:
            'The **similarity metric** used for vector search. Defaults to `"cosine"`.\n\n' +
            '**Available options:** `"cosine"`, `"euclidean"`, `"dotProduct"`.',
          values: ['cosine', 'euclidean', 'dotProduct'],
        },
        {
          optional: true,
          name: 'indexName',
          type: 'string',
          description:
            'The **name of the vector search index** (optional, defaults to property name).',
        },
      ],
    }),

    filter: new AnnotationSpec({
      description:
        'Assigns a field as a **filter field** for a **MongoDB Vector Search Index**.\n\n' +
        '- The assigned field **must be indexed** for efficient filtering.\n' +
        '- Filters allow vector search queries to return results **only within a specific category, user group, or tag**.\n' +
        '- The vector index must be defined using `@db.mongo.search.vector`.\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.mongo.search.vector 512, "cosine"\n' +
        'embedding: number[]\n\n' +
        '@db.mongo.search.filter "embedding"\n' +
        'category: string\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: true,
      argument: [
        {
          optional: false,
          name: 'indexName',
          type: 'string',
          description:
            'The **name of the vector search index** this field should be used as a filter for.',
        },
      ],
    }),
  },

  patch: {
    strategy: new AnnotationSpec({
      description:
        'Defines the **patching strategy** for updating MongoDB documents.\n\n' +
        '- **"replace"** → The field or object will be **fully replaced**.\n' +
        '- **"merge"** → The field or object will be **merged recursively** (applies only to objects, not arrays).\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.mongo.patch.strategy "merge"\n' +
        'settings: {\n' +
        '  notifications: boolean\n' +
        '  preferences: {\n' +
        '    theme: string\n' +
        '  }\n' +
        '}\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: false,
      argument: {
        name: 'strategy',
        type: 'string',
        description: 'The **patch strategy** for this field: `"replace"` (default) or `"merge"`.',
        values: ['replace', 'merge'],
      },
      validate(token, args, doc) {
        const field = token.parentNode!
        const errors = [] as TMessages
        const definition = field.getDefinition()
        if (!definition) {
          return errors
        }
        let wrongType = false
        if (isRef(definition)) {
          const def = doc.unwindType(definition.id!, definition.chain)?.def
          if (!isStructure(def) && !isInterface(def) && !isArray(def)) {
            wrongType = true
          }
        } else if (!isStructure(definition) && !isInterface(definition) && !isArray(definition)) {
          wrongType = true
        }
        if (wrongType) {
          errors.push({
            message: `[db.mongo] type of object or array expected when using @db.mongo.patch.strategy`,
            severity: 1,
            range: token.range,
          })
        }
        return errors
      },
    }),
  },

  array: {
    uniqueItems: new AnnotationSpec({
      description:
        'Marks an **array field** as containing *globally unique items* when ' +
        'handling **patch `$insert` operations**.\n\n' +
        '- Forces the patcher to use **set-semantics** (`$setUnion`) instead of a ' +
        'plain append, so duplicates are silently skipped.\n' +
        '- Has **no effect** on `$replace`, `$update`, or `$remove`.\n' +
        '- If the array\'s element type already defines one or more ' +
        '`@expect.array.key` properties, *uniqueness is implied* and this annotation ' +
        'is unnecessary (but harmless).\n\n' +
        '**Example:**\n' +
        '```atscript\n' +
        '@db.mongo.array.uniqueItems\n' +
        'tags: string[]\n' +
        '\n' +
        '// Later in a patch payload …\n' +
        '{\n' +
        '  $insert: {\n' +
        '    tags: ["mongo", "mongo"] // second "mongo" is ignored\n' +
        '  }\n' +
        '}\n' +
        '```\n',
      nodeType: ['prop'],
      multiple: false,
      validate(token, args, doc) {
        const field = token.parentNode!
        const errors = [] as TMessages
        const definition = field.getDefinition()
        if (!definition) {
          return errors
        }
        let wrongType = false
        if (isRef(definition)) {
          const def = doc.unwindType(definition.id!, definition.chain)?.def
          if (!isArray(def)) {
            wrongType = true
          }
        } else if (!isArray(definition)) {
          wrongType = true
        }
        if (wrongType) {
          errors.push({
            message: `[db.mongo] type of array expected when using @db.mongo.array.uniqueItems`,
            severity: 1,
            range: token.range,
          })
        }
        return errors
      },
    }),
  },
}
