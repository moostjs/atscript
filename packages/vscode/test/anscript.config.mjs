/* eslint-disable import/no-default-export */
import { AnnotationSpec, defineConfig } from '../../core/dist/index.mjs'

class MongoKeyType extends AnnotationSpec {
  constructor() {
    super({
      description: 'Type of key (must be upplied to _id)',
      nodeType: ['prop'],
      arguments: [
        {
          name: 'type',
          type: 'string',
          description: 'Defines type of key "_id"',
          values: ['ObjectId', 'String', 'Number'],
        },
      ],
    })
  }

  validate(main, args) {
    const messages = super.validate(main, args) || []
    console.log('MongoKeyType validate', main.parentNode.id)
    if (main.parentNode.id !== '_id') {
      messages.push({
        severity: 1,
        message: `${main.text} must be used on "_id" field`,
        range: main.range,
      })
    }
    console.log(messages)
    return messages.length > 0 ? messages : undefined
  }
}

export default defineConfig({
  unknownAnnotation: 'error',
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
      key: new MongoKeyType(),
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
