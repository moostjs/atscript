import type { TPipe } from './core.pipe'
import { $pipe } from './core.pipe'
import { annotations, definition, unwrap } from './special.pipe'
import { block, identifier, pun, text } from './tokens.pipe'

const type = $pipe('type', [
  identifier('public').asFlag('public').optional().skip('\n'),
  identifier('type').as('type').skip('\n'),
  identifier().as('name').unique('identifier').global().skip('\n'),
  pun('=').skip('\n'),
  definition(
    //
    $pipe('ref').t('identifier'),
    $pipe('const').t('text'),
    $pipe('const').t('number')
  )
    .separatedBy('&', '|')
    .respectPriority(),
]).skip('\n', ';')

const props = $pipe('prop', [
  annotations(),
  identifier().or(text()).as('name').unique('prop').skip('\n'),
  pun('?').asFlag('optional').optional().skip('\n'),
  pun(':').skip('\n'),
  definition(
    //
    $pipe('ref').t('identifier'),
    $pipe('const').t('text'),
    $pipe('const').t('number'),
    interfaceBlock
  )
    .separatedBy('&', '|')
    .respectPriority(),
]).skip('\n', ';', ',') as TPipe

function interfaceBlock() {
  return $pipe('structure', [
    block('{}').as('token').skip('\n', ';'),
    unwrap('token').with(props),
  ]).skip('\n', ';') as TPipe
}

const structure = $pipe('interface', [
  annotations(),
  identifier('public').asFlag('public').optional().skip('\n'),
  identifier('interface').as('type').skip('\n'),
  identifier().as('name').unique('identifier').global().skip('\n'),
  definition(interfaceBlock),
]).skip('\n', ';')

export const pipes = {
  type,
  props,
  structure,
}
