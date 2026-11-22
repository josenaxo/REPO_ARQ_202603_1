# Modelo de datos del servicio `notificaciones`

**Responsable:** Rol 3. **Tarea:** F2-02 (versión mínima).
**Tabla:** `ceibbo-app-<stage>`, compartida (`PK`, `SK`). No usa el índice `GSI1`.

## Entidades

| Entidad | PK / SK | Atributos principales |
|---|---|---|
| Notificación | `NOTIF#<usuarioId>` / `<creadaEn>#<id>` | id, usuarioId, tipo, titulo, cuerpo, enlace, leida, creadaEn |

- Una notificación nace de un evento de la cola (`contracts/eventos/*.json`). Su `id` es el `id` del evento y su `creadaEn` es la `fecha` del evento.
- `usuarioId` es el `destinatarioId` del evento: el `sub` de Cognito de quien la recibe.
- Todas las notificaciones de un usuario comparten la PK `NOTIF#<usuarioId>` y la SK empieza con la fecha, así que una sola Query las trae ordenadas.
- La PK usa el prefijo propio `NOTIF#` y no `USER#`, porque `USER#` es de perfiles: cada servicio es dueño de sus prefijos (`docs/patrones.md`, sección 2.3).

| Evento | Destinatario | Notificación | Enlace |
|---|---|---|---|
| `PostulacionCreada` | la empresa dueña de la oferta | "Nueva postulación" | `/empresa/postulantes?oferta=<oportunidadId>` |
| `HabilidadValidada` | el estudiante | "Habilidad validada" | `/student/habilidades` |

## Patrones de acceso

| # | Patrón | Pantalla | Operación | Clave |
|---|---|---|---|---|
| 1 | Guardar la notificación de un evento, sin duplicar | (consumidor de la cola) | PutItem condicional | `NOTIF#<destinatarioId> / <fecha>#<id>` con `attribute_not_exists(PK)` |
| 2 | Mis notificaciones, más nuevas primero | `*/notificaciones` | Query | `PK = NOTIF#<sub>`, orden descendente |
| 3 | Marcar una como leída | `*/notificaciones` | Query + filtro, y UpdateItem condicional | filtro `id = <id>` dentro de `NOTIF#<sub>`; `attribute_exists(PK)` |
| 4 | Marcar todas como leídas | `*/notificaciones` | Query + filtro, y un UpdateItem por cada una | filtro `leida = false` dentro de `NOTIF#<sub>` |
| 5 | Borrar una | `*/notificaciones` | Query + filtro, y DeleteItem condicional | filtro `id = <id>` dentro de `NOTIF#<sub>`; `attribute_exists(PK)` |
| 6 | Contar las no leídas (el número de la campana) | barras de navegación de los tres roles, cada 30 s | Query + filtro con `Select: COUNT` | filtro `leida = false` dentro de `NOTIF#<sub>`. Devuelve solo el número, pero DynamoDB lee la partición completa |

**Ningún patrón usa `Scan`.** Los patrones 3 a 5 leen la partición del usuario y filtran: un usuario tiene pocas notificaciones, así que es aceptable.

## Reglas

- **Idempotencia:** SQS entrega cada mensaje "al menos una vez", así que un evento puede llegar repetido. La clave sale del evento (su fecha y su id): la segunda escritura falla por la condición y no crea un duplicado. No hace falta un registro aparte de eventos procesados. Con un registro aparte, si el proceso se cae entre las dos escrituras, el evento quedaría marcado como procesado sin su notificación.
- **Mensajes inválidos:** si un mensaje no cumple su contrato, el consumidor lo devuelve en `batchItemFailures`. SQS lo reintenta y, tras 5 intentos, lo manda a la DLQ (`infra/shared`). Los demás mensajes del lote se procesan igual.
- **Eventos de otro tipo:** si llega un evento que no es para notificaciones, se borra de la cola sin crear nada y queda en el log.
- **Dueño:** cada ruta busca solo en la partición del `sub` del token. Si la notificación es de otro usuario, para él no existe (404).
- **Sin upsert:** marcar y borrar usan `attribute_exists(PK)`; si la notificación ya no existe, no se vuelve a crear.
