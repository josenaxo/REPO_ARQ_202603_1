// Adaptador de entrada: traduce cada ruta HTTP a su caso de uso y el resultado a una respuesta.
// Las rutas son las que ya llaman las pantallas (frontend/src/app/*/notificaciones/page.tsx)
// y la campana de las barras de navegación (frontend/src/components/layout/*Nav.tsx).
import { ErrorDominio } from '../../domain/errores.mjs'
import * as casos from '../../application/notificaciones.mjs'
import { repositorioNotificacionesDynamo } from '../out/dynamoRepositorioNotificaciones.mjs'

// El autorizador JWT ya validó el token: aquí solo se lee quién es el usuario.
// No se exige grupo: estudiantes, empresas y colegios reciben notificaciones.
function leerActor(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims
  return claims?.sub ? { id: claims.sub } : null
}

const respuesta = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

// Recibe las dependencias para poder probar el handler con dobles (test/http.test.mjs).
export function crearHandler(deps) {
  return async function manejar(event) {
    try {
      const actor = leerActor(event)
      const id = event.pathParameters?.id
      switch (event.routeKey) {
        case 'GET /notifications':
          return respuesta(200, await casos.misNotificaciones(deps, { actor }))
        case 'GET /notifications/unread-count':
          return respuesta(200, await casos.contarNoLeidas(deps, { actor }))
        case 'PATCH /notifications/read-all':
          return respuesta(200, await casos.marcarTodasLeidas(deps, { actor }))
        case 'PATCH /notifications/{id}/read':
          return respuesta(200, await casos.marcarLeida(deps, { actor, id }))
        case 'DELETE /notifications/{id}':
          await casos.eliminar(deps, { actor, id })
          return respuesta(204)
        default:
          return respuesta(404, { mensaje: 'ruta no encontrada' })
      }
    } catch (error) {
      if (error instanceof ErrorDominio) return respuesta(error.estado, { mensaje: error.message })
      console.error(JSON.stringify({ nivel: 'error', ruta: event.routeKey, mensaje: String(error) }))
      return respuesta(500, { mensaje: 'Error interno' })
    }
  }
}

// La raíz de composición: aquí se conecta el adaptador real.
export const handler = crearHandler({ repositorio: repositorioNotificacionesDynamo })
