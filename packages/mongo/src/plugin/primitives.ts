import { TAtscriptConfig } from '@atscript/core'
export const primitives: TAtscriptConfig['primitives'] = {
  mongo: {
    extensions: {
      objectId: {
        type: 'string',
        documentation:
          'Represents a **MongoDB ObjectId**.\n\n' +
          '- Stored as a **string** but can be converted to an ObjectId at runtime.\n' +
          '- Useful for handling `_id` fields and queries that require ObjectId conversion.\n' +
          '- Automatically converts string `_id` values into **MongoDB ObjectId** when needed.\n\n' +
          '**Example:**\n' +
          '```atscript\n' +
          'userId: mongo.objectId\n' +
          '```\n',
        expect: {
          pattern: /^[a-fA-F0-9]{24}$/,
        },
      },
      vector: {
        type: { kind: 'array', of: 'number' },
        documentation:
          'Represents a **MongoDB Vector (Array of Numbers)** for **Vector Search**.\n\n' +
          '- Equivalent to `number[]` but explicitly used for **vector embeddings**.\n\n' +
          '**Example:**\n' +
          '```atscript\n' +
          'embedding: mongo.vector\n' +
          '```\n',
      },
    },
  },
}
