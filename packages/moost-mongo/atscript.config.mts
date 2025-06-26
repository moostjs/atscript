import { defineConfig } from '@atscript/core'
import ts from '@atscript/typescript'
import { MongoPlugin } from '@atscript/mongo'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts(), MongoPlugin()],
  format: 'dts',
  unknownAnnotation: 'warn',
})
