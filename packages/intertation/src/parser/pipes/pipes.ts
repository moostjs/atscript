import type { TNodeData } from '../../tokenizer/types'
import type { TTransformedNode } from '../types'
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
  block('[]').as('token').skip('\n'),
  definition(allowedValues).from('token').separatedBy('&', '|', ',').respectPriority(),
  block('[]').optional().empty().wrap('array', true),
]

const tuple = $pipe('tuple', tuplePipe).skip('\n')
allowedValues.unshift(tuple)

const type = $pipe('type', [
  identifier('public').asFlag('public').optional().skip('\n'),
  identifier('type').as('type').skip('\n'),
  identifier().as('name').unique('identifier').global().skip('\n'),
  pun('=').skip('\n'),
  definition(allowedValues).separatedBy('&', '|').respectPriority(),
]).skip('\n', ';')

const props = $pipe('prop', [
  annotations(),
  identifier().or(text()).as('name').unique('prop').skip('\n'),
  pun('?').asFlag('optional').optional().skip('\n'),
  pun(':').skip('\n'),
  definition(allowedValues).separatedBy('&', '|').respectPriority(),
]).skip('\n', ';', ',') as TPipe

const interfacePipe = [
  //
  block('{}').as('token').skip('\n', ';'),
  block('[]').optional().empty().wrap('array', true),
  unwrap('token').with([props]),
  //
]

function interfaceBlock(array = false) {
  return $pipe('structure', array ? interfacePipe : [interfacePipe[0], interfacePipe[2]]).skip(
    '\n',
    ';'
  ) as TPipe
}

allowedValues.push(interfaceBlock(true))

const structure = $pipe('interface', [
  annotations(),
  identifier('public').asFlag('public').optional().skip('\n'),
  identifier('interface').as('type').skip('\n'),
  identifier().as('name').unique('identifier').global().skip('\n'),
  definition([interfaceBlock()]),
]).skip('\n', ';')

export function defineValuePipe(
  entity: TTransformedNode['entity'],
  name: TNodeData['node'],
  supportArray = false
) {
  const steps = [$token(name).as('token')]
  if (supportArray) {
    steps.push(block('[]').optional().empty().wrap('array', true))
  }
  return $pipe(entity, steps).skip('\n')
}

export const pipes = {
  type,
  props,
  structure,
}
