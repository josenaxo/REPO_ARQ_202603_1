// Pruebas del dominio: de qué evento sale qué notificación, y qué mensajes se rechazan.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notificacionDesdeEvento } from '../src/domain/Notificacion.mjs'
import { EventoInvalido } from '../src/domain/errores.mjs'
import { comprobarPuerto } from '../src/ports/comprobarPuerto.mjs'
import { METODOS_REPOSITORIO_NOTIFICACIONES } from '../src/ports/RepositorioNotificaciones.mjs'
import { habilidadValidada, postulacionCreada, repositorioEnMemoria } from './dobles.mjs'

test('PostulacionCreada avisa a la empresa y lleva a sus postulantes', () => {
  const evento = postulacionCreada()
  const n = notificacionDesdeEvento(evento)
  assert.equal(n.id, evento.id)
  assert.equal(n.usuarioId, evento.datos.empresaId)
  assert.equal(n.tipo, 'PostulacionCreada')
  assert.match(n.cuerpo, /Práctica Desarrollador Junior/)
  assert.equal(n.enlace, `/empresa/postulantes?oferta=${evento.datos.oportunidadId}`)
  assert.equal(n.leida, false)
  assert.equal(n.creadaEn, evento.fecha)
})

test('HabilidadValidada avisa al estudiante', () => {
  const n = notificacionDesdeEvento(habilidadValidada())
  assert.equal(n.usuarioId, 'estudiante-001')
  assert.equal(n.titulo, 'Habilidad validada')
  assert.match(n.cuerpo, /Docker/)
  assert.equal(n.enlace, '/student/habilidades')
})

test('un evento que no es para notificaciones se ignora (null)', () => {
  assert.equal(notificacionDesdeEvento({ tipo: 'PerfilActualizado', version: 1 }), null)
})

test('un mensaje sin destinatario es inválido', () => {
  assert.throws(() => notificacionDesdeEvento(postulacionCreada({ destinatarioId: '' })), EventoInvalido)
})

test('un mensaje con una versión distinta de 1 es inválido', () => {
  assert.throws(() => notificacionDesdeEvento(postulacionCreada({ version: 2 })), /versión 2/)
})

test('un mensaje con fecha inválida es inválido', () => {
  assert.throws(() => notificacionDesdeEvento(postulacionCreada({ fecha: 'ayer' })), /fecha/)
})

test('un mensaje sin los datos que pide su contrato es inválido', () => {
  const evento = postulacionCreada({ datos: { oportunidadId: 'x' } })
  assert.throws(() => notificacionDesdeEvento(evento), /datos\.estudianteId/)
})

test('un mensaje que no es un objeto es inválido', () => {
  assert.throws(() => notificacionDesdeEvento(null), EventoInvalido)
})

test('el repositorio en memoria cumple el puerto RepositorioNotificaciones', () => {
  assert.doesNotThrow(() =>
    comprobarPuerto('RepositorioNotificaciones', repositorioEnMemoria(), METODOS_REPOSITORIO_NOTIFICACIONES),
  )
})
