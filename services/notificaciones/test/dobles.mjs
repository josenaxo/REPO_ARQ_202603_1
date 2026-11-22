// Dobles de prueba: un repositorio en memoria que cumple el puerto, sin AWS,
// y los eventos de ejemplo de los contratos (contracts/eventos/ejemplos).
import { readFileSync } from 'node:fs'

export function repositorioEnMemoria() {
  const items = new Map() // clave: "<usuarioId>|<id>"
  const clave = (usuarioId, id) => `${usuarioId}|${id}`
  return {
    items,
    async guardar(notificacion) {
      const k = clave(notificacion.usuarioId, notificacion.id)
      if (items.has(k)) return false
      items.set(k, { ...notificacion })
      return true
    },
    async listar(usuarioId) {
      return [...items.values()]
        .filter((n) => n.usuarioId === usuarioId)
        .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))
        .map((n) => ({ ...n }))
    },
    async marcarLeida(usuarioId, id) {
      const n = items.get(clave(usuarioId, id))
      if (!n) return false
      n.leida = true
      return true
    },
    async marcarTodasLeidas(usuarioId) {
      let actualizadas = 0
      for (const n of items.values()) {
        if (n.usuarioId === usuarioId && !n.leida) {
          n.leida = true
          actualizadas++
        }
      }
      return actualizadas
    },
    async eliminar(usuarioId, id) {
      return items.delete(clave(usuarioId, id))
    },
  }
}

const ejemplo = (nombre) => JSON.parse(
  readFileSync(new URL(`../../../contracts/eventos/ejemplos/${nombre}.json`, import.meta.url), 'utf8'),
)

// Una copia nueva en cada llamada, para que una prueba no modifique la de otra.
export const postulacionCreada = (cambios = {}) => ({ ...ejemplo('PostulacionCreada'), ...cambios })
export const habilidadValidada = (cambios = {}) => ({ ...ejemplo('HabilidadValidada'), ...cambios })

// Un mensaje de SQS tal como llega a la Lambda (solo los campos que usa el adaptador).
export const mensajeSqs = (messageId, cuerpo) => ({
  messageId,
  body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
})
