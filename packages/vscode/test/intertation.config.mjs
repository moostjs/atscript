/* eslint-disable import/no-default-export */
import { AnnotationSpec, defineConfig } from 'intertation'

export default defineConfig({
  primitives: {
    custom: {},
  },
  annotations: {
    label: new AnnotationSpec({
      description: 'This Annotation defines a label for the field',
      arguments: [
        {
          name: 'label',
          type: 'string',
          description: 'Specify label, e.g. "My Label"',
        },
      ],
    }),
    mongo: {
      collection: new AnnotationSpec({
        description: 'This Annotation Defines a MongoDB collection',
        arguments: [
          {
            name: 'collectionName',
            type: 'string',
            description: 'Specify collection name, e.g. "myCollection"',
          },
        ],
      }),
      index: new AnnotationSpec({
        description: 'This Annotation defines MongoDB index for the field',
        arguments: [
          {
            name: 'indexName',
            type: 'string',
            description: 'Specify Index Name, e.g. "myIndex"',
          },
          {
            name: 'isUnique',
            optional: true,
            type: 'boolean',
            description: 'Index will be unique when `true`',
          },
        ],
      }),
    },
  },
})
