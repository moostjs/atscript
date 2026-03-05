import { defineConfig } from '@atscript/core'
import { MongoPlugin } from '@atscript/mongo/plugin'
import ts from '@atscript/typescript'

export default defineConfig({
  rootDir: 'src',
  plugins: [ts(), MongoPlugin()],
  format: 'dts',
  unknownAnnotation: 'warn',
})
