// Adaptador de entrada: recibe un lote de mensajes de la cola de eventos (SQS) y procesa
// cada mensaje por separado. Los que fallan se devuelven en batchItemFailures: SQS reintenta
// solo esos y, después de 5 intentos (maxReceiveCount de infra/shared), los manda a la DLQ.
// Los que salieron bien se borran de la cola aunque otros del mismo lote fallen.
import { EventoInvalido } from '../../domain/errores.mjs'
import { procesarEvento } from '../../application/notificaciones.mjs'
import { repositorioNotificacionesDynamo } from '../out/dynamoRepositorioNotificaciones.mjs'

function leerMensaje(record) {
  try {
    return JSON.parse(record.body)
  } catch {
    throw new EventoInvalido('el cuerpo no es JSON válido')
  }
}

// Recibe las dependencias para poder probar el handler con dobles (test/sqs.test.mjs).
export function crearHandler(deps) {
  return async function manejar(event) {
    const batchItemFailures = []
    for (const record of event.Records ?? []) {
      try {
        const evento = leerMensaje(record)
        const resultado = await procesarEvento(deps, evento)
        console.log(JSON.stringify({ nivel: 'info', messageId: record.messageId, tipo: evento.tipo, resultado }))
      } catch (error) {
        // Mensaje inválido (no se arregla reintentando) o falla de DynamoDB (sí puede arreglarse):
        // en los dos casos queda para reintento y, si sigue fallando, termina en la DLQ.
        const nivel = error instanceof EventoInvalido ? 'warn' : 'error'
        console.error(JSON.stringify({ nivel, messageId: record.messageId, mensaje: String(error) }))
        batchItemFailures.push({ itemIdentifier: record.messageId })
      }
    }
    return { batchItemFailures }
  }
}

// La raíz de composición: aquí se conecta el adaptador real.
export const handler = crearHandler({ repositorio: repositorioNotificacionesDynamo })
