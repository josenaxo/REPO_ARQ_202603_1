# Estimación de costos y volúmenes

Esta estimación modela los cinco servicios serverless de Ceibbo en `us-east-1`: `health`, `perfiles`, `habilidades`, `postulaciones` y `notificaciones`. Los valores permiten comparar tres escenarios y deben reemplazarse cuando existan métricas reales.

No es una cotización de AWS. Los precios y beneficios de Free Tier pueden cambiar; antes de entregar se deben validar en la [AWS Pricing Calculator](https://calculator.aws/).

## 1. Supuestos generales

| Supuesto | Piloto | Esperado | Crecimiento |
|---|---:|---:|---:|
| Usuarios activos mensuales (MAU) | 1.000 | 10.000 | 100.000 |
| Stage considerado | 1 | 1 | 1 |
| Memoria por Lambda | 256 MB | 256 MB | 256 MB |
| Tamaño lógico de lectura DynamoDB | hasta 4 KB | hasta 4 KB | hasta 4 KB |
| Tamaño lógico de escritura DynamoDB | hasta 1 KB | hasta 1 KB | hasta 1 KB |
| Región | `us-east-1` | `us-east-1` | `us-east-1` |

Notas:

- En `perfiles`, las solicitudes HTTP incluyen las llamadas internas que realiza `habilidades` a `GET /perfiles/me`.
- Una solicitud HTTP produce una invocación de Lambda en este diseño.
- Las RRU y WRU representan unidades lógicas. Elementos más grandes, lecturas consistentes, transacciones o escaneos aumentan el consumo.
- Los mensajes SQS de cada servicio son sus publicaciones. En la fila de notificaciones, la columna SQS cuenta las lecturas y los borrados del consumidor (`ReceiveMessage` y `DeleteMessage`, sección 5.2).
- Los volúmenes de logs suponen registros estructurados sin cuerpos completos ni datos personales.

## 2. Escenario 1: piloto

Uso académico o piloto con 1.000 usuarios activos mensuales.

| Servicio | Solicitudes HTTP/mes | Lambda invoc./mes | Duración prom. | DynamoDB RRU | DynamoDB WRU | SQS mensajes | Logs GB |
|---|---:|---:|---:|---:|---:|---:|---:|
| Health | 43.200 | 43.200 | 50 ms | 43.200 | 0 | 0 | 0,05 |
| Perfiles | 25.000 | 25.000 | 120 ms | 20.000 | 5.000 | 0 | 0,10 |
| Habilidades | 12.000 | 12.000 | 160 ms | 20.000 | 4.000 | 800 | 0,06 |
| Postulaciones | 10.000 | 10.000 | 140 ms | 15.000 | 4.000 | 1.000 | 0,06 |
| Notificaciones | 245.980 | 247.780 | 50 ms | 245.980 | 3.780 | 3.600 | 0,12 |
| **Total** | **336.180** | **337.980** | - | **344.180** | **16.780** | **5.400** | **0,39** |

Almacenamiento supuesto: 1 GB en DynamoDB y 2 GB en S3.

## 3. Escenario 2: uso esperado

Operación inicial estable con 10.000 usuarios activos mensuales.

| Servicio | Solicitudes HTTP/mes | Lambda invoc./mes | Duración prom. | DynamoDB RRU | DynamoDB WRU | SQS mensajes | Logs GB |
|---|---:|---:|---:|---:|---:|---:|---:|
| Health | 129.600 | 129.600 | 50 ms | 129.600 | 0 | 0 | 0,15 |
| Perfiles | 300.000 | 300.000 | 120 ms | 240.000 | 60.000 | 0 | 1,00 |
| Habilidades | 150.000 | 150.000 | 160 ms | 250.000 | 50.000 | 10.000 | 0,70 |
| Postulaciones | 200.000 | 200.000 | 140 ms | 300.000 | 80.000 | 20.000 | 0,90 |
| Notificaciones | 2.473.000 | 2.503.000 | 50 ms | 2.473.000 | 63.000 | 60.000 | 1,25 |
| **Total** | **3.252.600** | **3.282.600** | - | **3.392.600** | **253.000** | **90.000** | **4,00** |

Almacenamiento supuesto: 5 GB en DynamoDB y 20 GB en S3.

## 4. Escenario 3: crecimiento

Escenario de expansión con 100.000 usuarios activos mensuales.

| Servicio | Solicitudes HTTP/mes | Lambda invoc./mes | Duración prom. | DynamoDB RRU | DynamoDB WRU | SQS mensajes | Logs GB |
|---|---:|---:|---:|---:|---:|---:|---:|
| Health | 432.000 | 432.000 | 50 ms | 432.000 | 0 | 0 | 0,50 |
| Perfiles | 4.000.000 | 4.000.000 | 120 ms | 3.200.000 | 800.000 | 0 | 12,00 |
| Habilidades | 2.000.000 | 2.000.000 | 160 ms | 3.400.000 | 700.000 | 150.000 | 8,00 |
| Postulaciones | 3.000.000 | 3.000.000 | 140 ms | 4.500.000 | 1.200.000 | 300.000 | 12,00 |
| Notificaciones | 24.895.000 | 25.345.000 | 50 ms | 24.895.000 | 945.000 | 900.000 | 12,67 |
| **Total** | **34.327.000** | **34.777.000** | - | **36.427.000** | **3.645.000** | **1.350.000** | **45,17** |

Almacenamiento supuesto: 40 GB en DynamoDB y 200 GB en S3.

## 5. Volumen detallado por servicio

### 5.1 Habilidades (Ian)

La siguiente tabla explica de dónde proviene el volumen del servicio asignado a Ian.

| Operación | Piloto | Esperado | Crecimiento | Recursos principales |
|---|---:|---:|---:|---|
| `POST /habilidades` | 2.000 | 20.000 | 250.000 | API Gateway, Lambda, llamada a perfiles y escritura DynamoDB |
| `GET /habilidades/me` | 6.000 | 75.000 | 1.050.000 | API Gateway, Lambda y consulta DynamoDB |
| `GET /habilidades/pendientes` | 2.000 | 25.000 | 300.000 | API Gateway, Lambda y consulta por GSI |
| `PATCH /habilidades/{estudianteId}/{habilidadId}` | 2.000 | 30.000 | 400.000 | API Gateway, Lambda, lectura/escritura y evento SQS cuando se valida |
| **Total** | **12.000** | **150.000** | **2.000.000** | - |

### 5.2 Notificaciones (Matías)

Supuestos del Rol 3, con las reglas de la sección 1: una solicitud HTTP es una invocación de Lambda, una lectura de hasta 4 KB es 1 RRU y una escritura de hasta 1 KB es 1 WRU.

- **La campana.** Las barras de navegación de los tres roles piden `GET /notifications/unread-count` cada 30 segundos mientras la página está abierta (`frontend/src/components/layout/*Nav.tsx`). Se supone que cada usuario activo tiene la plataforma abierta 2 horas al mes: 240 consultas por usuario. Cada consulta lee la partición del usuario con `Select: COUNT` (1 RRU).
- **Los eventos.** Son los mensajes que publican habilidades y postulaciones en las secciones 2 a 4: 1.800, 30.000 y 450.000 al mes. Se cuenta una invocación del consumidor por evento, que es la cota superior, porque un lote puede traer hasta 10 mensajes. Cada evento escribe una notificación (1 WRU) y genera una lectura y un borrado en la cola (2 solicitudes SQS).
- **La pantalla de notificaciones.** 4 visitas al mes por usuario activo. Cada notificación se marca como leída una vez y el 10 % se borra.
- **Duración y memoria.** 50 ms en promedio (supuesto; se mide con `Duration`), a 256 MB (`services/notificaciones/serverless.yml:13`).
- **Logs.** 0,5 KB por invocación: las líneas de inicio y fin de Lambda, y una línea por evento en el consumidor.

| Operación | Piloto | Esperado | Crecimiento | Recursos principales |
|---|---:|---:|---:|---|
| `GET /notifications/unread-count` (la campana) | 240.000 | 2.400.000 | 24.000.000 | API Gateway, Lambda y Query con `Select: COUNT` |
| `GET /notifications` | 4.000 | 40.000 | 400.000 | API Gateway, Lambda y Query |
| `PATCH /notifications/{id}/read` y `read-all` | 1.800 | 30.000 | 450.000 | API Gateway, Lambda, Query y UpdateItem |
| `DELETE /notifications/{id}` | 180 | 3.000 | 45.000 | API Gateway, Lambda, Query y DeleteItem |
| **Total HTTP** | **245.980** | **2.473.000** | **24.895.000** | - |
| Consumidor de la cola (invocaciones) | 1.800 | 30.000 | 450.000 | Lambda, PutItem, ReceiveMessage y DeleteMessage |

Costo bruto estimado de notificaciones, con las tarifas de la sección 6:

| Escenario | Costo bruto | Principal componente |
|---|---:|---|
| Piloto | USD 0,44/mes | API Gateway, por la campana |
| Esperado | USD 4,49/mes | API Gateway (USD 2,47) y logs (USD 0,63) |
| Crecimiento | USD 45,64/mes | API Gateway (USD 24,90), Lambda (USD 10,35) y logs (USD 6,34) |

La campana es entre el 96 % y el 98 % de las solicitudes de notificaciones. Mejoras de diseño, de la más simple a la más completa:

- Consultar solo mientras la pestaña está visible y cada 60 segundos: la mitad de las solicitudes o menos, con un cambio solo en el frontend.
- Avisar por WebSocket solo cuando cambia el número, en vez de preguntar cada 30 segundos. Usaría el mismo API WebSocket diseñado para mensajes (F2-03).

## 6. Tarifas de referencia

Tarifas aproximadas usadas para el cálculo, sin impuestos:

| Recurso | Tarifa de referencia |
|---|---:|
| API Gateway HTTP API | USD 1,00 por millón de solicitudes |
| Lambda, solicitudes | USD 0,20 por millón |
| Lambda, cómputo x86 | USD 0,0000166667 por GB-segundo |
| DynamoDB on-demand, lectura | USD 0,125 por millón de RRU |
| DynamoDB on-demand, escritura | USD 0,625 por millón de WRU |
| DynamoDB Standard, almacenamiento | USD 0,25 por GB-mes |
| SQS Standard | USD 0,40 por millón de solicitudes |
| CloudWatch Logs, ingesta inicial | USD 0,50 por GB |
| S3 Standard, almacenamiento inicial | USD 0,023 por GB-mes |
| Cognito Essentials | 10.000 MAU gratuitos; luego USD 0,0055 por MAU en este rango |

Fuentes: [Lambda](https://aws.amazon.com/lambda/pricing/), [API Gateway](https://aws.amazon.com/api-gateway/pricing/), [DynamoDB](https://aws.amazon.com/dynamodb/pricing/), [SQS](https://aws.amazon.com/sqs/pricing/), [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/), [S3](https://aws.amazon.com/s3/pricing/) y [Cognito](https://aws.amazon.com/cognito/pricing/).

## 7. Fórmulas

```text
Solicitudes API = suma de solicitudes HTTP de los servicios

GB-segundos Lambda =
  invocaciones × (duración_ms / 1.000) × (memoria_MB / 1.024)

Costo Lambda =
  solicitudes_millones × tarifa_solicitudes
  + GB-segundos × tarifa_cómputo

Costo DynamoDB =
  RRU_millones × tarifa_lectura
  + WRU_millones × tarifa_escritura
  + almacenamiento_GB × tarifa_almacenamiento

Costo SQS = solicitudes_SQS_millones × tarifa_SQS

Costo Logs = GB_ingeridos × tarifa_CloudWatch
```

## 8. Resultado mensual estimado

El costo bruto no descuenta Free Tier. El costo con franquicias aplica las franquicias recurrentes conocidas y no considera créditos promocionales de AWS Academy.

| Escenario | Costo bruto aproximado | Con franquicias recurrentes aproximadas | Principal componente |
|---|---:|---:|---|
| Piloto | USD 0,60/mes | USD 0,16/mes | API Gateway y almacenamiento S3 |
| Esperado | USD 4,66/mes | USD 1,47/mes | API Gateway y almacenamiento S3 |
| Crecimiento | USD 545,65/mes | USD 531,35/mes | Cognito: cerca de USD 495/mes |

Pendiente del cierre de costos (F2-07b): esta tabla todavía no incluye notificaciones. Según la sección 5.2, notificaciones suma cerca de USD 0,44, 4,49 y 45,64 brutos al mes. En el escenario esperado, el total bruto pasa de USD 4,66 a unos 9,15.

Franquicias recurrentes consideradas:

- Lambda: 1 millón de solicitudes y 400.000 GB-segundos mensuales.
- SQS: 1 millón de solicitudes mensuales.
- Cognito Lite/Essentials: 10.000 MAU mensuales para usuarios directos.
- DynamoDB Standard: primeros 25 GB de almacenamiento.
- CloudWatch Logs: primeros 5 GB de ingesta, sujeto a las condiciones vigentes de la cuenta.
- Transferencia de salida: el escenario se mantiene bajo 100 GB mensuales y se supone cubierto por la franquicia agregada de AWS.

No se incluyen dominios, WAF, soporte, NAT Gateway, backups, recuperación multi-región ni impuestos. Estos conceptos deben agregarse si forman parte del diseño final.

## 9. Validación posterior al despliegue

Después de un mes real, reemplazar los supuestos con:

- API Gateway `Count` por ruta.
- Lambda `Invocations`, `Duration`, `Errors` y memoria configurada.
- DynamoDB `ConsumedReadRequestUnits`, `ConsumedWriteRequestUnits` y almacenamiento.
- SQS `NumberOfMessagesSent`, recibidos y eliminados.
- CloudWatch `IncomingBytes` por grupo de logs.
- Cognito MAU del User Pool.
- Cost Explorer con tags `service`, `stage` y `owner`.

