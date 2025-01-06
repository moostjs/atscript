import type { TLexicalToken } from '../../tokenizer/types'
import type { TNodeEntity } from '../nodes'
import { $n } from '../nodes'
import { SemanticArrayNode } from '../nodes/array-node'
import type { TPipe } from './core.pipe'
import { $pipe } from './core.pipe'
import { annotations, definition, unwrap } from './special.pipe'
import { $token, block, identifier, pun, text } from './tokens.pipe'

const ref = defineValuePipe('ref', 'identifier', true)
const constText = defineValuePipe('const', 'text', false)
const constNumber = defineValuePipe('const', 'number', false)

const allowedValues: TPipe[] = [
  ref,
  constText,
  constNumber,
  // add tuple later
  // add interface later
]

const tuplePipe: TPipe['pipe'] = [
  //
  block('[]').saveAs('identifier'),
  definition(allowedValues)
    .from('identifier')
    .separatedBy('&', '|', ',')
    .skip('\n')
    .respectPriority(),
  block('[]')
    .optional()
    .empty()
    .wrap(() => new SemanticArrayNode(), true),
]

const groupPipe: TPipe['pipe'] = [
  //
  block('()').saveAs('identifier'),
  definition(allowedValues).from('identifier').separatedBy('&', '|').skip('\n').respectPriority(),
  block('[]')
    .optional()
    .empty()
    .wrap(() => new $n.SemanticArrayNode(), true),
]

const tuple = $pipe('tuple', tuplePipe).skip('\n')
const group = $pipe('group', groupPipe).skip('\n')
allowedValues.unshift(tuple)
allowedValues.unshift(group)

const type = $pipe('type', [
  identifier('public').saveAs('public').optional().skip('\n'),
  identifier('type').saveAs('type').skip('\n').suppressEobError(),
  identifier().saveAs('identifier').unique('identifier').global().skip('\n'),
  pun('=').skip('\n'),
  definition(allowedValues).separatedBy('&', '|').skip('\n').respectPriority(),
]).skip('\n', ';')

const props = $pipe('prop', [
  annotations(),
  identifier().or(text()).saveAs('identifier').unique('prop').skip('\n'),
  pun('?').saveAs('optional').optional().skip('\n'),
  pun(':').skip('\n'),
  definition(allowedValues).separatedBy('&', '|').skip('\n').respectPriority(),
  pun(';', ',', '\n').orEob().lookBehind(),
]).skip('\n', ';', ',') as TPipe

const interfacePipe = [
  //
  block('{}').saveAs('identifier'),
  unwrap('identifier').with([props]),
  block('[]')
    .optional()
    .empty()
    .wrap(() => new $n.SemanticArrayNode(), true),
  //
]

function interfaceBlock(array = false) {
  return $pipe('structure', array ? interfacePipe : interfacePipe.slice(0, 2)).skip(
    '\n',
    ';'
  ) as TPipe
}

allowedValues.unshift(interfaceBlock(true))

const structure = $pipe('interface', [
  annotations(),
  identifier('public').saveAs('public').optional().skip('\n'),
  identifier('interface').saveAs('type').skip('\n').suppressEobError(),
  identifier().saveAs('identifier').unique('identifier').global().skip('\n'),
  definition([interfaceBlock()]),
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

export const pipes = {
  type,
  props,
  structure,
  tuple,
}
