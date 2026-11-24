// Prueba de integración: el adaptador de DynamoDB contra DynamoDB Local (Docker).
// En local, antes hay que levantarlo con npm run local:up desde la raíz del repositorio;
// en el CI corre contra el servicio dynamodb de .github/workflows/ci.yml.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { repositorioNotificacionesDynamo as repositorio } from '../../src/adapters/out/dynamoRepositorioNotificaciones.mjs'
import { notificacionDesdeEvento } from '../../src/domain/Notificacion.mjs'
import { postulacionCreada } from '../dobles.mjs'

// Usuarios e ids distintos en cada corrida, para no chocar con el seed ni con otra prueba.
const sufijo = Date.now().toString(36)
const usuario = `test-notif-${sufijo}`
const otro = `test-notif2-${sufijo}`

const notificacion = (destinatarioId, id, fecha) =>
  notificacionDesdeEvento(postulacionCreada({ destinatarioId, id: `${id}-${sufijo}`, fecha }))

test('no duplica un evento repetido y cuenta solo las no leídas de cada usuario', async (t) => {
  const a = notificacion(usuario, 'a', '2026-11-20T10:00:00.000Z')
  const b = notificacion(usuario, 'b', '2026-11-21T10:00:00.000Z')
  const c = notificacion(otro, 'c', '2026-11-21T11:00:00.000Z')
  t.after(async () => {
    for (const n of [a, b, c]) await repositorio.eliminar(n.usuarioId, n.id)
  })

  assert.equal(await repositorio.guardar(a), true)
  assert.equal(await repositorio.guardar(a), false) // el mismo evento otra vez: no se duplica
  await repositorio.guardar(b)
  await repositorio.guardar(c)

  assert.deepEqual((await repositorio.listar(usuario)).map((n) => n.id), [b.id, a.id])
  assert.equal(await repositorio.contarNoLeidas(usuario), 2)
  assert.equal(await repositorio.contarNoLeidas(otro), 1)

  assert.equal(await repositorio.marcarLeida(usuario, a.id), true)
  assert.equal(await repositorio.contarNoLeidas(usuario), 1)

  assert.equal(await repositorio.marcarTodasLeidas(usuario), 1)
  assert.equal(await repositorio.contarNoLeidas(usuario), 0)
  assert.equal(await repositorio.contarNoLeidas(otro), 1) // las del otro usuario no se tocan
})
