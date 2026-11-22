// Pruebas de las rutas HTTP con el repositorio en memoria: cada usuario ve y cambia solo las suyas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearHandler } from '../src/adapters/in/http.mjs'
import { procesarEvento } from '../src/application/notificaciones.mjs'
import { habilidadValidada, postulacionCreada, repositorioEnMemoria } from './dobles.mjs'

const EMPRESA = 'b4c8d478-00d1-7042-b122-aff3833289e3' // destinatario del ejemplo de PostulacionCreada

// Un evento de API Gateway (HTTP API) con el token ya validado por el autorizador.
function peticion(routeKey, { sub = EMPRESA, id } = {}) {
  return {
    routeKey,
    pathParameters: id ? { id } : undefined,
    requestContext: { authorizer: { jwt: { claims: sub ? { sub, 'cognito:groups': '[empresa]' } : {} } } },
  }
}

async function preparar() {
  const repositorio = repositorioEnMemoria()
  const deps = { repositorio }
  await procesarEvento(deps, postulacionCreada({ id: 'n-vieja', fecha: '2026-11-20T10:00:00.000Z' }))
  await procesarEvento(deps, postulacionCreada({ id: 'n-nueva', fecha: '2026-11-21T10:00:00.000Z' }))
  await procesarEvento(deps, habilidadValidada()) // es de un estudiante, no de la empresa
  return { repositorio, manejar: crearHandler(deps) }
}

const cuerpo = (r) => JSON.parse(r.body)

test('GET /notifications devuelve solo las del usuario, más nuevas primero', async () => {
  const { manejar } = await preparar()
  const r = await manejar(peticion('GET /notifications'))
  assert.equal(r.statusCode, 200)
  assert.deepEqual(cuerpo(r).map((n) => n.id), ['n-nueva', 'n-vieja'])
})

test('PATCH /notifications/{id}/read marca una como leída', async () => {
  const { repositorio, manejar } = await preparar()
  const r = await manejar(peticion('PATCH /notifications/{id}/read', { id: 'n-vieja' }))
  assert.equal(r.statusCode, 200)
  assert.equal(repositorio.items.get(`${EMPRESA}|n-vieja`).leida, true)
  assert.equal(repositorio.items.get(`${EMPRESA}|n-nueva`).leida, false)
})

test('no se puede marcar la notificación de otro usuario', async () => {
  const { manejar } = await preparar()
  // La de HabilidadValidada es de estudiante-001: para la empresa no existe.
  const r = await manejar(peticion('PATCH /notifications/{id}/read', { id: habilidadValidada().id }))
  assert.equal(r.statusCode, 404)
})

test('PATCH /notifications/read-all marca todas las del usuario', async () => {
  const { repositorio, manejar } = await preparar()
  const r = await manejar(peticion('PATCH /notifications/read-all'))
  assert.equal(r.statusCode, 200)
  assert.deepEqual(cuerpo(r), { actualizadas: 2 })
  assert.equal(repositorio.items.get(`estudiante-001|${habilidadValidada().id}`).leida, false)
})

test('DELETE /notifications/{id} la borra y responde 204; la segunda vez, 404', async () => {
  const { manejar } = await preparar()
  const primera = await manejar(peticion('DELETE /notifications/{id}', { id: 'n-nueva' }))
  const segunda = await manejar(peticion('DELETE /notifications/{id}', { id: 'n-nueva' }))
  assert.equal(primera.statusCode, 204)
  assert.equal(primera.body, undefined)
  assert.equal(segunda.statusCode, 404)
})

test('sin usuario en el token responde 403', async () => {
  const { manejar } = await preparar()
  const r = await manejar(peticion('GET /notifications', { sub: null }))
  assert.equal(r.statusCode, 403)
})

test('una ruta desconocida responde 404', async () => {
  const { manejar } = await preparar()
  const r = await manejar(peticion('POST /notifications'))
  assert.equal(r.statusCode, 404)
})

test('un error inesperado responde 500 sin detalles', async (t) => {
  t.mock.method(console, 'error', () => {})
  const manejar = crearHandler({ repositorio: { listar: async () => { throw new Error('se cayó') } } })
  const r = await manejar(peticion('GET /notifications'))
  assert.equal(r.statusCode, 500)
  assert.deepEqual(cuerpo(r), { mensaje: 'Error interno' })
})
