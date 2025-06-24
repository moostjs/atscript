import type { TLexicalToken } from '../../tokenizer/types'
import type { TNodeEntity } from '../nodes'
import { $n } from '../nodes'
import { SemanticArrayNode } from '../nodes/array-node'
import type { TPipe } from './core.pipe'
import { $pipe } from './core.pipe'
import { annotations, definition, propName, refWithChain, unwrap } from './special.pipe'
import { $token, block, identifier, pun, text } from './tokens.pipe'

const ref = $pipe('ref', [refWithChain()]) // defineValuePipe('ref', 'identifier', true)
const constText = defineValuePipe('const', 'text', false)
const constNumber = defineValuePipe('const', 'number', false)

const allowedValuesPipeArray: TPipe[] = [
  constNumber,
  ref,
  constText,
  // add tuple later
  // add interface later
]

const tuplePipeArray: TPipe['pipe'] = [
  //
  block('[]').saveAs('identifier'),
  definition(allowedValuesPipeArray)
    .from('identifier')
    .separatedBy('&', '|', ',')
    .skip('\n')
    .respectPriority(),
  block('[]')
    .optional()
    .empty()
    .wrap(() => new SemanticArrayNode(), true),
]

const groupPipeArray: TPipe['pipe'] = [
  //
  block('()').saveAs('identifier'),
  definition(allowedValuesPipeArray)
    .from('identifier')
    .separatedBy('&', '|')
    .skip('\n')
    .respectPriority(),
  block('[]')
    .optional()
    .empty()
    .wrap(() => new $n.SemanticArrayNode(), true),
]

const tuple = $pipe('tuple', tuplePipeArray).skip('\n')
const group = $pipe('group', groupPipeArray).skip('\n')
allowedValuesPipeArray.unshift(tuple)
allowedValuesPipeArray.unshift(group)

const type = $pipe('type', [
  annotations(),
  identifier('export').saveAs('export').optional().skip('\n'),
  identifier('type').saveAs('type').skip('\n').suppressEobError(),
  identifier().saveAs('identifier').global().skip('\n'),
  pun('=').skip('\n'),
  definition(allowedValuesPipeArray).separatedBy('&', '|').skip('\n').respectPriority(),
]).skip('\n', ';')

const props = $pipe('prop', [
  annotations(),
  // identifier().or(text()).saveAs('identifier').skip('\n').debug(),
  propName(),
  pun('?').saveAs('optional').optional().skip('\n'),
  pun(':').skip('\n'),
  definition(allowedValuesPipeArray).separatedBy('&', '|').skip('\n').respectPriority(),
  // block('[]')
  //   .optional()
  //   .empty()
  //   .wrap(() => new $n.SemanticArrayNode(), true),
  pun(';', ',', '\n').orEob().lookBehind(),
]).skip('\n', ';', ',') as TPipe

const structurePipeArray = [
  //
  block('{}').saveAs('identifier'),
  unwrap('identifier').with([props]),
  block('[]')
    .optional()
    .empty()
    .wrap(() => new $n.SemanticArrayNode(), true),
  //
]

function structureBlock(array = false) {
  return $pipe('structure', array ? structurePipeArray : structurePipeArray.slice(0, 2)).skip(
    '\n',
    ';'
  ) as TPipe
}

allowedValuesPipeArray.unshift(structureBlock(true))

const interfaceType = $pipe('interface', [
  annotations(),
  identifier('export').saveAs('export').optional().skip('\n'),
  identifier('interface').saveAs('type').skip('\n').suppressEobError(),
  identifier().saveAs('identifier').global().skip('\n'),
  definition([structureBlock()]),
]).skip('\n', ';')

export function defineValuePipe(
  entity: TNodeEntity,
  name: TLexicalToken['type'],
  supportArray = false
) {
  const steps = [$token(name).saveAs('identifier')]
  if (supportArray) {
    steps.push(
      block('[]')
        .optional()
        .empty()
        .wrap(() => new $n.SemanticArrayNode(), true)
    )
  }
  return $pipe(entity, steps).skip('\n')
}

const importPipe = $pipe('import', [
  identifier('import').saveAs('identifier').skip('\n'),
  block('{}').saveAs('inner').skip('\n'),
  identifier('from').saveAs('from').skip('\n'),
  text().saveAs('path').skip(';', '\n'),
  definition([$pipe('ref', [identifier().saveAs('identifier').skip('\n')])])
    .from('inner')
    .separatedBy(',')
    .skip('\n')
    .respectPriority(),
]).skip('\n', ';')

export const pipes = {
  type,
  props,
  interfaceType,
  importPipe,
  tuple,
}
