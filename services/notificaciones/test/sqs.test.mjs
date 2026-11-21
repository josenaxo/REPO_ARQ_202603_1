// Pruebas del consumidor de la cola: idempotencia y respuesta parcial de lote.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearHandler } from '../src/adapters/in/sqs.mjs'
import { habilidadValidada, mensajeSqs, postulacionCreada, repositorioEnMemoria } from './dobles.mjs'

function preparar(t) {
  // Los logs del handler no ensucian la salida de las pruebas.
  t.mock.method(console, 'log', () => {})
  t.mock.method(console, 'error', () => {})
  const repositorio = repositorioEnMemoria()
  return { repositorio, manejar: crearHandler({ repositorio }) }
}

test('un mensaje duplicado produce una sola notificación', async (t) => {
  const { repositorio, manejar } = preparar(t)
  const evento = postulacionCreada()

  const primera = await manejar({ Records: [mensajeSqs('m1', evento)] })
  // SQS entrega "al menos una vez": el mismo evento puede llegar de nuevo con otro messageId.
  const segunda = await manejar({ Records: [mensajeSqs('m2', evento)] })

  assert.deepEqual(primera.batchItemFailures, [])
  assert.deepEqual(segunda.batchItemFailures, [])
  assert.equal(repositorio.items.size, 1)
})

test('un mensaje inválido aparece en batchItemFailures sin afectar a los demás', async (t) => {
  const { repositorio, manejar } = preparar(t)

  const resultado = await manejar({
    Records: [
      mensajeSqs('bueno-1', postulacionCreada()),
      mensajeSqs('malo', '{ esto no es json'),
      mensajeSqs('bueno-2', habilidadValidada()),
    ],
  })

  assert.deepEqual(resultado.batchItemFailures, [{ itemIdentifier: 'malo' }])
  assert.equal(repositorio.items.size, 2)
})

test('si falla la base de datos, solo ese mensaje queda para reintento', async (t) => {
  const { repositorio, manejar } = preparar(t)
  const guardarReal = repositorio.guardar
  repositorio.guardar = async (n) => {
    if (n.tipo === 'HabilidadValidada') throw new Error('DynamoDB no responde')
    return guardarReal(n)
  }

  const resultado = await manejar({
    Records: [mensajeSqs('m1', postulacionCreada()), mensajeSqs('m2', habilidadValidada())],
  })

  assert.deepEqual(resultado.batchItemFailures, [{ itemIdentifier: 'm2' }])
  assert.equal(repositorio.items.size, 1)
})

test('un evento que no es para notificaciones se borra de la cola sin crear nada', async (t) => {
  const { repositorio, manejar } = preparar(t)

  const resultado = await manejar({ Records: [mensajeSqs('m1', { tipo: 'OtroEvento', version: 1 })] })

  assert.deepEqual(resultado.batchItemFailures, [])
  assert.equal(repositorio.items.size, 0)
})
