import {
  TAnnotationsTree,
  AnnotationSpec,
  isInterface,
  isStructure,
  isRef,
  isPrimitive,
  TMessages,
} from '@ts-anscript/core'

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

export const annotations: TAnnotationsTree = {
  mongo: {
    collection: new AnnotationSpec({
      description:
        'Defines a **MongoDB collection**. This annotation is required to mark an interface as a collection.\n\n' +
        '- Automatically enforces a **non-optional** `_id` field.\n' +
        '- `_id` must be of type **`string`**, **`number`**, or **`mongo.objectId`**.\n' +
        '- Ensures that `_id` is included if not explicitly defined.\n\n' +
        '**Example:**\n' +
        '```anscript\n' +
        '@mongo.collection "users"\n' +
        'export interface User {\n' +
        '    _id: mongo.objectId\n' +
        '    email: string.email\n' +
        '}\n' +
        '```\n',
      nodeType: ['interface'],
      argument: {
        name: 'name',
        type: 'string',
        description: 'The **name of the MongoDB collection**.',
      },
      validate(token, args, doc) {
        const parent = token.parentNode
        const struc = parent?.getDefinition()
        const errors = [] as TMessages
        if (isInterface(parent) && parent.props.has('_id') && isStructure(struc)) {
          const _id = parent.props.get('_id')!
          const isOptional = !!_id.token('optional')
          if (isOptional) {
            errors.push({
              message: `[mongo] _id can't be optional in Mongo Collection`,
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
              message: `[mongo] _id must be of type string, number or mongo.objectId`,
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

    index: {
      plain: new AnnotationSpec({
        description:
          'Defines a **standard MongoDB index** on a field.\n\n' +
          '- Improves query performance on indexed fields.\n' +
          '- Can be used for **single-field** or **compound** indexes.\n\n' +
          '**Example:**\n' +
          '```anscript\n' +
          '@mongo.index.plain "departmentIndex"\n' +
          'department: string\n' +
          '```\n',
        multiple: true,
        nodeType: ['prop'],
        argument: {
          optional: true,
          name: 'indexName',
          type: 'string',
          description:
            'The **name of the index** (optional). If omitted, MongoDB assigns a default name.',
        },
      }),

      unique: new AnnotationSpec({
        description:
          'Creates a **unique index** on a field to ensure no duplicate values exist.\n\n' +
          '- Enforces uniqueness at the database level.\n' +
          '- Automatically prevents duplicate entries.\n' +
          '- Typically used for **emails, usernames, and IDs**.\n\n' +
          '**Example:**\n' +
          '```anscript\n' +
          '@mongo.index.unique "uniqueEmailIndex"\n' +
          'email: string.email\n' +
          '```\n',
        multiple: true,
        nodeType: ['prop'],
        argument: {
          optional: true,
          name: 'indexName',
          type: 'string',
          description:
            'The **name of the unique index** (optional). If omitted, MongoDB assigns a default name.',
        },
      }),

      text: new AnnotationSpec({
        description:
          'Creates a **legacy MongoDB text index** for full-text search.\n\n' +
          '**⚠ WARNING:** *Text indexes slow down database operations. Use `@mongo.defineTextSearch` instead for better performance.*\n\n' +
          '- Allows **basic full-text search** on a field.\n' +
          '- Does **not support fuzzy matching or ranking**.\n' +
          '- **Replaced by MongoDB Atlas Search Indexes (`@mongo.searchIndex.text`).**\n\n' +
          '**Example:**\n' +
          '```anscript\n' +
          '@mongo.index.text 5\n' +
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

    dynamicTextSearch: new AnnotationSpec({
      description:
        'Creates a **dynamic MongoDB Search Index** that applies to the entire collection.\n\n' +
        '- **Indexes all text fields automatically** (no need to specify fields).\n' +
        '- Supports **language analyzers** for text tokenization.\n' +
        '- Enables **fuzzy search** (typo tolerance) if needed.\n\n' +
        '**Example:**\n' +
        '```anscript\n' +
        '@mongo.dynamicTextSearch "globalSearch", "lucene.english", 1\n' +
        'export interface MongoCollection {}\n' +
        '```\n',
      nodeType: ['interface'], // Collection-level annotation
      multiple: false, // Only one dynamic index per collection
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
        {
          optional: true,
          name: 'indexName',
          type: 'string',
          description: 'The **name of the search index** (optional, defaults to `"default"`).',
        },
      ],
    }),

    defineTextSearch: new AnnotationSpec({
      description:
        'Defines a **MongoDB Atlas Search Index** for the collection. This must be used before applying `@mongo.useTextSearch` on fields.\n\n' +
        '- **Creates a named search index** for full-text search.\n' +
        '- **Specify analyzers and fuzzy search** behavior at the index level.\n' +
        '- **Fields must explicitly use `@mongo.useTextSearch`** to be included in this search index.\n\n' +
        '**Example:**\n' +
        '```anscript\n' +
        '@mongo.defineTextSearch "mySearchIndex", "lucene.english", 1\n' +
        'export interface MongoCollection {}\n' +
        '```\n',
      nodeType: ['interface'], // Collection-level annotation
      multiple: true, // Can define multiple text search indexes per collection
      argument: [
        {
          name: 'indexName',
          type: 'string',
          description:
            'The name of the search index. Fields must reference this name using `@mongo.useTextSearch`.',
        },
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
      ],
    }),

    useTextSearch: new AnnotationSpec({
      description:
        'Marks a field to be **included in a MongoDB Atlas Search Index** defined by `@mongo.defineTextSearch`.\n\n' +
        '- **The field must reference an existing search index name**.\n\n' +
        '**Example:**\n' +
        '```anscript\n' +
        '@mongo.useTextSearch "mySearchIndex", 5\n' +
        'firstName: string\n' +
        '```\n',
      nodeType: ['prop'], // Field-level annotation
      multiple: true, // Can apply multiple search indexes to the same field
      argument: [
        {
          name: 'indexName',
          type: 'string',
          description:
            'The **name of the search index** defined in `@mongo.defineTextSearch`. This links the field to the correct index.',
        },
        {
          optional: true,
          name: 'analyzer',
          type: 'string',
          description:
            'The text analyzer for tokenization. Defaults to `"lucene.standard"`.\n\n' +
            '**Available options:** `"lucene.standard"`, `"lucene.english"`, `"lucene.spanish"`, `"lucene.german"`, etc.',
          values: analyzers,
        },
      ],
    }),

    vectorIndex: new AnnotationSpec({
      description:
        'Creates a **MongoDB Vector Search Index** for **semantic search, embeddings, and AI-powered search**.\n\n' +
        '- Each field that stores vector embeddings **must define its own vector index**.\n' +
        '- Supports **cosine similarity, Euclidean distance, and dot product similarity**.\n' +
        '- Vector fields must be an **array of numbers**.\n\n' +
        '**Example:**\n' +
        '```anscript\n' +
        '@mongo.vectorIndex 512, "cosine"\n' +
        'embedding: mongo.vector\n' +
        '```\n',
      nodeType: ['prop'], // Field-level annotation
      multiple: false, // Each field can have only one vector index
      argument: [
        {
          optional: false, // Required
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
            'The **name of the vector search index** (optional, defaults to `"default"`).',
        },
      ],
    }),

    vectorFilter: new AnnotationSpec({
      description:
        'Assigns a field as a **filter field** for a **MongoDB Vector Search Index**.\n\n' +
        '- The assigned field **must be indexed** for efficient filtering.\n' +
        '- Filters allow vector search queries to return results **only within a specific category, user group, or tag**.\n' +
        '- The vector index must be defined using `@mongo.vectorIndex`.\n\n' +
        '**Example:**\n' +
        '```anscript\n' +
        '@mongo.vectorIndex 512, "cosine"\n' +
        'embedding: number[]\n\n' +
        '@mongo.vectorFilter "embedding"\n' +
        'category: string\n' +
        '```\n',
      nodeType: ['prop'], // Field-level annotation
      multiple: true, // A field can be used as a filter for multiple vector indexes
      argument: [
        {
          optional: false, // Required argument
          name: 'indexName',
          type: 'string',
          description:
            'The **name of the vector search index** this field should be used as a filter for.',
        },
      ],
    }),
  },
}
