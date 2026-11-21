// Adaptador de salida: implementa el puerto RepositorioNotificaciones con DynamoDB.
// Las claves salen de docs/datos/notificaciones.md y solo se conocen aquí.
//   PK = NOTIF#<usuarioId>   SK = <creadaEn>#<id>
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { comprobarPuerto } from '../../ports/comprobarPuerto.mjs'
import { METODOS_REPOSITORIO_NOTIFICACIONES } from '../../ports/RepositorioNotificaciones.mjs'

// En local (Docker) se usa DynamoDB Local; en AWS no hay endpoint y el SDK usa el real.
const endpoint = process.env.DYNAMO_ENDPOINT
const db = DynamoDBDocumentClient.from(new DynamoDBClient(endpoint ? { endpoint } : {}))
const tabla = () => process.env.TABLE_NAME
const particion = (usuarioId) => `NOTIF#${usuarioId}`

// Quita las claves técnicas antes de devolver un ítem al caso de uso.
function sinClaves({ PK, SK, ...datos }) {
  return datos
}

const esCondicionFallida = (error) => error?.name === 'ConditionalCheckFailedException'

// Una Query devuelve hasta 1 MB por vez; se repite mientras haya más páginas.
async function consultarTodo(usuarioId, extra = {}) {
  const items = []
  let desde
  do {
    const respuesta = await db.send(new QueryCommand({
      TableName: tabla(),
      KeyConditionExpression: 'PK = :pk',
      ...extra,
      ExpressionAttributeValues: { ':pk': particion(usuarioId), ...extra.ExpressionAttributeValues },
      ScanIndexForward: false, // la SK empieza con la fecha: más nuevas primero
      ExclusiveStartKey: desde,
    }))
    items.push(...respuesta.Items)
    desde = respuesta.LastEvaluatedKey
  } while (desde)
  return items
}

// La pantalla solo conoce el id; la SK lleva además la fecha. Se busca dentro de la
// partición del usuario, así nadie puede tocar una notificación ajena.
async function buscar(usuarioId, id) {
  const [item] = await consultarTodo(usuarioId, {
    FilterExpression: '#id = :id',
    ExpressionAttributeNames: { '#id': 'id' },
    ExpressionAttributeValues: { ':id': id },
  })
  return item ?? null
}

// attribute_exists evita el upsert silencioso: si la notificación se borró entre la búsqueda
// y la escritura, UpdateItem no la vuelve a crear.
async function marcarItemLeido(item) {
  try {
    await db.send(new UpdateCommand({
      TableName: tabla(),
      Key: { PK: item.PK, SK: item.SK },
      UpdateExpression: 'SET leida = :si',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeValues: { ':si': true },
    }))
    return true
  } catch (error) {
    if (esCondicionFallida(error)) return false
    throw error
  }
}

export const repositorioNotificacionesDynamo = comprobarPuerto(
  'RepositorioNotificaciones',
  {
    // Idempotencia: la clave viene del evento (su fecha y su id). Si SQS entrega el mismo
    // mensaje otra vez, la condición falla y no se crea un duplicado.
    async guardar(notificacion) {
      try {
        await db.send(new PutCommand({
          TableName: tabla(),
          Item: {
            PK: particion(notificacion.usuarioId),
            SK: `${notificacion.creadaEn}#${notificacion.id}`,
            ...notificacion,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        }))
        return true
      } catch (error) {
        if (esCondicionFallida(error)) return false
        throw error
      }
    },

    async listar(usuarioId) {
      return (await consultarTodo(usuarioId)).map(sinClaves)
    },

    async marcarLeida(usuarioId, id) {
      const item = await buscar(usuarioId, id)
      return item ? marcarItemLeido(item) : false
    },

    async marcarTodasLeidas(usuarioId) {
      const noLeidas = await consultarTodo(usuarioId, {
        FilterExpression: 'leida = :no',
        ExpressionAttributeValues: { ':no': false },
      })
      let actualizadas = 0
      for (const item of noLeidas) {
        if (await marcarItemLeido(item)) actualizadas++
      }
      return actualizadas
    },

    async eliminar(usuarioId, id) {
      const item = await buscar(usuarioId, id)
      if (!item) return false
      try {
        await db.send(new DeleteCommand({
          TableName: tabla(),
          Key: { PK: item.PK, SK: item.SK },
          ConditionExpression: 'attribute_exists(PK)',
        }))
        return true
      } catch (error) {
        if (esCondicionFallida(error)) return false
        throw error
      }
    },
  },
  METODOS_REPOSITORIO_NOTIFICACIONES,
)
