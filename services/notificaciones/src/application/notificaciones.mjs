// Casos de uso del servicio notificaciones (F2-02).
// Reciben sus dependencias como parámetro (el repositorio). No conocen AWS ni HTTP.
import { ErrorDominio } from '../domain/errores.mjs'
import { notificacionDesdeEvento } from '../domain/Notificacion.mjs'

function exigirUsuario(actor) {
  if (!actor?.id) throw new ErrorDominio(403, 'falta el usuario del token')
}

// Procesa un evento de la cola. Devuelve qué pasó, para dejarlo en el log.
// Si el mensaje no cumple su contrato, lanza EventoInvalido (lo maneja el adaptador de SQS).
export async function procesarEvento({ repositorio }, evento) {
  const notificacion = notificacionDesdeEvento(evento)
  if (!notificacion) return 'ignorado'
  const creada = await repositorio.guardar(notificacion)
  return creada ? 'creada' : 'duplicado'
}

// Cada usuario solo ve, marca o borra las suyas: el repositorio busca siempre con el id del token.
export async function misNotificaciones({ repositorio }, { actor }) {
  exigirUsuario(actor)
  return repositorio.listar(actor.id)
}

export async function marcarLeida({ repositorio }, { actor, id }) {
  exigirUsuario(actor)
  if (!(await repositorio.marcarLeida(actor.id, id))) throw new ErrorDominio(404, 'la notificación no existe')
  return { id, leida: true }
}

export async function marcarTodasLeidas({ repositorio }, { actor }) {
  exigirUsuario(actor)
  return { actualizadas: await repositorio.marcarTodasLeidas(actor.id) }
}

// El número de la campana: las barras de navegación de los tres roles lo piden cada 30 s.
export async function contarNoLeidas({ repositorio }, { actor }) {
  exigirUsuario(actor)
  return { count: await repositorio.contarNoLeidas(actor.id) }
}

export async function eliminar({ repositorio }, { actor, id }) {
  exigirUsuario(actor)
  if (!(await repositorio.eliminar(actor.id, id))) throw new ErrorDominio(404, 'la notificación no existe')
}
