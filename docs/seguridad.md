# Diseño de seguridad de Ceibbo

Plantilla de la tarea F2-06a (Rol 3). Junta en un solo lugar cada control de seguridad, dice si está **Implementado** o **Diseñado** y con qué se demuestra. El examen pide distinguir las dos cosas.

- **Implementado:** está en el código o en la configuración y se puede mostrar. Lleva evidencia: archivo y línea (`infra/shared/serverless.yml:127`) o una captura.
- **Diseñado:** está pensado, pero no se construyó por tiempo o por una restricción del Learner Lab. Lleva por qué no se hizo y cómo se haría.

## Cómo se completa

| Qué | Quién | Hasta |
|---|---|---|
| Tabla de rutas de sus servicios (sección 2) | José: health, postulaciones e infra/shared · Ian: habilidades · Matías: perfiles y notificaciones | Dom 22, 20:00 (F2-10) |
| Pasar CORS y throttling a Implementado (secciones 7 y 8) | José, al terminar F2-15a | Dom 22, 20:00 |
| Integrar los aportes y cerrar el diseño ideal | Matías | Lun 23, 12:00 (F2-06b) |

Lo que ya trae esta plantilla son **hechos del código**, con su archivo y línea. La redacción del informe la hace cada uno con sus palabras.

## 1. Resumen de controles

| # | Control | Qué protege | Estado hoy | Evidencia o qué falta |
|---|---|---|---|---|
| 1 | Identidad con Cognito | Saber quién es cada usuario | Implementado | `infra/shared/serverless.yml:60-100` |
| 2 | Autorizador JWT en el API | Que nadie sin token llegue a una Lambda | Implementado | `infra/shared/serverless.yml:126-138` y cada `services/*/serverless.yml` |
| 3 | Autorización por grupo y por dueño | Que cada actor haga solo lo suyo | Por confirmar en la sección 2 | Adaptador de entrada de cada servicio |
| 4 | Validación de entradas HTTP | Datos malformados o maliciosos | Por confirmar en la sección 2 | Dominio de cada servicio |
| 5 | Validación de mensajes de la cola | Mensajes con formato inválido | Por confirmar | Los contratos existen en `contracts/eventos/*.json` |
| 6 | Cifrado en tránsito | Que nadie lea el tráfico | Implementado por AWS | Sección 5 |
| 7 | Cifrado en reposo | Los datos guardados | Implementado por AWS (claves de AWS) | Sección 5. Claves propias en KMS: Diseñado |
| 8 | URLs firmadas para archivos | Subir y bajar archivos sin abrir el bucket | Diseñado | Sección 6 |
| 9 | CORS restringido | Que otro sitio no use la API desde un navegador | Implementado (F2-15a) | Solo `http://localhost:3000` en `infra/shared/serverless.yml:45` y `:109` |
| 10 | Throttling | Ráfagas y abuso | Implementado (F2-15a) | 50 solicitudes por segundo y ráfaga de 100 en `infra/shared/serverless.yml:121-123` |
| 11 | Secretos fuera del código | Credenciales | Implementado (no hay secretos en el repositorio) | Sección 9. Secrets Manager: Diseñado |
| 12 | WAF | Ataques web comunes | Diseñado | Sección 10 |
| 13 | Mínimo privilegio en IAM | Que una Lambda comprometida no pueda tocarlo todo | Diseñado (hoy todas usan LabRole) | Sección 11 |
| 14 | Comunicación entre servicios | Las llamadas internas | Diseñado (hoy se reenvía el token del usuario) | Sección 12 |
| 15 | CI/CD sin credenciales guardadas (OIDC) | Que no se filtren llaves de AWS | Diseñado (hoy el CI no despliega) | Sección 13 |
| 16 | Alarmas de CloudWatch | Detectar errores, mensajes perdidos y saturación | Implementado (F2-01r), sin notificación | `infra/shared/serverless.yml:140-188`. Aviso por SNS o correo: Diseñado |

## 2. Rutas por servicio

Cada uno completa las filas de sus servicios. La columna **Grupo** viene de `docs/endpoints.md`: confírmala contra el código.

- **Dónde se comprueba:** archivo y línea donde el código revisa el grupo y el dueño.
- **Validaciones:** qué campos se revisan y qué responde si vienen mal (400, 403, 409).
- **Permisos IAM mínimos ideales:** acciones y recursos exactos que necesitaría un rol propio de esa función. Hoy son siempre Diseñados, porque todas usan LabRole.
- **Estado:** se refiere al grupo y a las validaciones.

Ejemplo del formato:

| Ruta | Grupo | Dónde se comprueba | Validaciones | Permisos IAM mínimos ideales | Estado |
|---|---|---|---|---|---|
| `GET /ejemplo/mias` | empresa | `services/x/src/adapters/in/http.mjs:20` | `limite` entre 1 y 50, si no 400 | `dynamodb:Query` sobre `arn:aws:dynamodb:us-east-1:<cuenta>:table/ceibbo-app-<stage>/index/GSI1` | Implementado |

### health (José)

| Ruta | Grupo | Dónde se comprueba | Validaciones | Permisos IAM mínimos ideales | Estado |
|---|---|---|---|---|---|
| `GET /health` | público, a propósito: es la sonda de salud (`services/health/serverless.yml:33-35`, sin autorizador) | No aplica. Solo responde `estado`, `baseDatos` y `fecha`, sin datos de usuarios (`src/application/verificarSalud.mjs:5-9`) | No recibe datos. Si DynamoDB no responde, 503 (`src/adapters/in/http.mjs:16`) | `dynamodb:GetItem` sobre la tabla, limitado al ítem `HEALTH` con la condición `dynamodb:LeadingKeys` | Implementado (`test/verificarSalud.test.mjs:13-23`) |
| `GET /health/privado` | cualquiera con token; no exige grupo | Autorizador JWT (`services/health/serverless.yml:36-41`). El handler solo lee los claims que ya validó el autorizador (`src/adapters/in/http.mjs:10-13`) | No recibe datos. Devuelve solo el `sub` y los grupos del propio token | El mismo `dynamodb:GetItem` | Implementado (sin token, 401 del autorizador; se prueba con la colección de `docs/postman/`) |

Los archivos de la tabla son relativos a `services/health/`. Rol ideal de la función `health` (Diseñado; hoy usa LabRole): `dynamodb:GetItem` sobre `arn:aws:dynamodb:us-east-1:<cuenta>:table/ceibbo-app-<stage>` con `ForAllValues:StringEquals` `dynamodb:LeadingKeys` = `HEALTH`, y `logs:CreateLogStream` y `logs:PutLogEvents` sobre `/aws/lambda/ceibbo-health-<stage>-health`. `GET /health` es pública a propósito: no expone datos y sirve para saber si la plataforma responde. Con el throttling del stage (sección 8) tampoco se puede usar para saturar la cuenta.

### postulaciones (José)

| Ruta | Grupo | Dónde se comprueba | Validaciones | Permisos IAM mínimos ideales | Estado |
|---|---|---|---|---|---|
| `POST /oportunidades` | empresa | `src/application/postulaciones.mjs:20` (`exigirGrupo`, líneas 8-11). La `empresaId` sale del token, nunca del cuerpo (`:21`) | JSON válido, si no 400 (`src/adapters/in/http.mjs:16-24`). Lista blanca de campos: mandar `empresaId` o `activa` da 400 (`src/domain/Oportunidad.mjs:5`, `:19-20`). `tipo` de una lista cerrada; `remoto` booleano; `titulo` (hasta 120) y `descripcion` (hasta 2000) obligatorios (`:21-30`) | `dynamodb:PutItem` sobre la tabla | Implementado (`test/casosDeUso.test.mjs:16-27`, `test/dominio.test.mjs:9-32`, `test/http.test.mjs:28`) |
| `GET /oportunidades` (canario, alias `live`) | todos con token, de cualquier grupo | Autorizador JWT de la ruta que crea `scripts/canario/canario-servicio.sh:128-144`. El caso de uso exige usuario (`src/application/postulaciones.mjs:28`) | `tipo` de la lista cerrada y `remoto` `true` o `false`, si no 400 (`:29-34`). Solo devuelve ofertas activas (`:36-39`) | `dynamodb:Query` sobre el índice `GSI1`. Además, el permiso de API Gateway para invocar la función queda limitado al alias `live` (`--qualifier`, `scripts/canario/canario-servicio.sh:152`) | Implementado (`test/casosDeUso.test.mjs:82-105`) |
| `GET /oportunidades/mias` | empresa | `src/application/postulaciones.mjs:43`. Filtra por la `empresaId` del token (`src/adapters/out/dynamoRepositorioPostulaciones.mjs:65-73`) | No recibe datos | `dynamodb:Query` sobre el índice `GSI1` | Implementado (`test/casosDeUso.test.mjs:16-23`) |
| `POST /oportunidades/{id}/postulaciones` | estudiante | `src/application/postulaciones.mjs:48`. El `estudianteId` sale del token (`:50`) | Oferta inexistente: 404 (`:13-16`). Oferta cerrada: 409 (`src/domain/Postulacion.mjs:5`). Postulación repetida: 409, con `Put` condicional `attribute_not_exists(PK)` (`src/adapters/out/dynamoRepositorioPostulaciones.mjs:75-93`) | `dynamodb:GetItem` y `dynamodb:PutItem` sobre la tabla; `sqs:SendMessage` sobre `EventsQueue` | Implementado (`test/casosDeUso.test.mjs:29-70`, `test/http.test.mjs:14`) |
| `GET /oportunidades/{id}/postulaciones` | empresa dueña | `src/application/postulaciones.mjs:71-73`: grupo `empresa` **y** la `empresaId` de la oferta igual al `sub` del token. Si no, 403 | Oferta inexistente: 404 | `dynamodb:GetItem` sobre la tabla; `dynamodb:Query` sobre la tabla | Implementado (`test/casosDeUso.test.mjs:72-80`) |
| `GET /postulaciones/mias` | estudiante, cada uno las suyas | `src/application/postulaciones.mjs:66`. Solo consulta `STUDENT#<sub del token>` (`src/adapters/out/dynamoRepositorioPostulaciones.mjs:95-102`) | No recibe datos | `dynamodb:Query` sobre el índice `GSI1` | Implementado (`test/casosDeUso.test.mjs:34`) |

`GET /oportunidades` no está en `serverless.yml`: la crea `scripts/canario/canario-servicio.sh` (D-03), también con el autorizador JWT (líneas 128-144). Los archivos de la tabla son relativos a `services/postulaciones/`.

En todas las rutas:

- Sin token, el autorizador responde 401 antes de llegar a la Lambda. El usuario y su grupo salen de los claims ya validados (`src/adapters/in/http.mjs:9-14`), y sin usuario la respuesta es 403 (`src/application/postulaciones.mjs:9`, prueba en `test/http.test.mjs:33`).
- Un error inesperado responde 500 sin detalles; el detalle queda solo en el log (`src/adapters/in/http.mjs:61-65`, prueba en `test/http.test.mjs:38`).
- Los valores del usuario llegan a DynamoDB como parámetros del SDK, nunca dentro del texto de la consulta, así que no hay inyección.
- Toda respuesta trae `X-App-Version` con el número de versión de la Lambda (`src/adapters/in/http.mjs:32`). Es para medir el canario; no expone datos del usuario ni de la cuenta.

Rol ideal de la función `postulaciones` (Diseñado; hoy usa LabRole). IAM se asigna por función, no por ruta, así que el rol junta lo de las seis rutas:

- `dynamodb:GetItem`, `dynamodb:PutItem` y `dynamodb:Query` sobre `arn:aws:dynamodb:us-east-1:<cuenta>:table/ceibbo-app-<stage>`.
- `dynamodb:Query` sobre `arn:aws:dynamodb:us-east-1:<cuenta>:table/ceibbo-app-<stage>/index/GSI1`.
- `sqs:SendMessage` sobre el ARN de `EventsQueue` (output `EventsQueueArn` de `infra/shared`).
- `logs:CreateLogStream` y `logs:PutLogEvents` sobre `/aws/lambda/ceibbo-postulaciones-<stage>-postulaciones`.
- Ninguna ruta necesita `Scan`, `UpdateItem`, `DeleteItem` ni S3.

Pendientes que no son de autorización: si SQS falla después de guardar la postulación, el evento se pierde y solo queda en el log (`src/application/postulaciones.mjs:55-61`). Se resuelve con el patrón Outbox. Además, `GET /oportunidades/mias` lee la partición `OPPORTUNITIES` y filtra por empresa; con muchas ofertas convendría una clave propia por empresa en `GSI1`. Es una mejora de rendimiento, no de seguridad.

### habilidades (Ian)

| Ruta | Grupo | Dónde se comprueba | Validaciones | Permisos IAM mínimos ideales | Estado |
|---|---|---|---|---|---|
| `POST /habilidades` | estudiante | | | | |
| `GET /habilidades/me` | estudiante | | | | |
| `GET /habilidades/pendientes` | colegio | | | | |
| `PATCH /habilidades/{estudianteId}/{habilidadId}` | colegio dueño | | | | |

Pendiente: completar esta tabla por ruta con archivo y línea, como las de los otros servicios. Mientras tanto, la matriz de Ian cubre el servicio completo (subida primero a `main` en el commit `e312c47` y traída aquí al juntar `main` con `develop`).

La matriz identifica los activos, amenazas, controles existentes, evidencia y riesgo residual de cada servicio. Los controles se evalúan en API Gateway, Lambda, Cognito, DynamoDB, SQS y el código del dominio.

| Servicio | Activos protegidos | Amenazas principales | Controles existentes | Evidencia en el repositorio | Riesgo residual y mejoras |
|---|---|---|---|---|---|
| Habilidades | Habilidades declaradas; estado pendiente/validada/rechazada; identidad del estudiante; relación estudiante-colegio; evento `HabilidadValidada`. | Acceso sin autenticación; estudiante ejecutando acciones de colegio; colegio validando estudiantes ajenos; IDOR mediante `estudianteId` o `habilidadId`; modificación o duplicación de habilidades; publicación de eventos falsos o repetidos; exposición de tokens o datos personales en logs; abuso de la Lambda o DynamoDB si se compromete `LabRole`. | Autorizador JWT de Cognito en todas las rutas; grupos `estudiante` y `colegio`; autorización en la capa de aplicación; comprobación del `colegioId`; validación del cuerpo y parámetros; escrituras condicionales en DynamoDB; mensajes de error genéricos para fallas inesperadas; cola SQS con DLQ compartida; TLS administrado por API Gateway. | `services/habilidades/serverless.yml`; `services/habilidades/src/adapters/in/http.js`; `services/habilidades/src/application/servicioHabilidades.js`; `services/habilidades/src/adapters/out/dynamoRepositorioHabilidades.js`; `services/habilidades/src/adapters/out/httpLectorPerfiles.js`; pruebas unitarias e integración del servicio. | `LabRole` tiene privilegios más amplios que los necesarios; CORS compartido permite `*`; falta auditoría explícita de quién validó y cuándo; faltan alarmas de seguridad y límites de tasa; el token se reenvía a perfiles. En producción: rol IAM exclusivo, CORS por dominio, WAF/rate limiting, logs de auditoría sin PII, alarmas, cifrado explícito y revisión de retención. |

#### Autenticación y autorización

- API Gateway valida la firma, emisor y audiencia del JWT antes de invocar la Lambda.
- El servicio obtiene `sub` y `cognito:groups` desde los claims validados; no debe confiar en un rol enviado en el body.
- `POST /habilidades` y `GET /habilidades/me` exigen rol `estudiante`.
- `GET /habilidades/pendientes` y `PATCH /habilidades/{estudianteId}/{habilidadId}` exigen rol `colegio`.
- Para validar o rechazar, el `colegioId` del actor debe coincidir con el colegio de la habilidad/estudiante. Comprobar únicamente el rol no es suficiente.
- Los identificadores de la URL se consideran datos no confiables y deben contrastarse con la identidad y el dominio.

#### Integridad y concurrencia

- La declaración de una habilidad debe usar una condición como `attribute_not_exists` para impedir duplicados.
- La decisión de validación debe comprobar el estado actual; una habilidad ya resuelta no debe volver a validarse sin una regla explícita.
- El evento `HabilidadValidada` debe publicarse solo después de confirmar la escritura.
- Los consumidores deben ser idempotentes porque SQS ofrece entrega al menos una vez.
- El evento debe incluir un identificador único, versión de contrato y fecha, pero no información personal innecesaria.

#### Confidencialidad y registros

- No registrar el header `Authorization`, access tokens ni cuerpos completos.
- Registrar solo identificadores técnicos necesarios, ruta, resultado y un correlation ID.
- Las respuestas 500 no deben incluir stack traces ni mensajes internos.
- Configurar retención limitada de CloudWatch Logs y revisar quién puede consultarlos.
- Mantener cifrado en tránsito mediante HTTPS y cifrado en reposo administrado por AWS para DynamoDB y SQS.

#### Dependencia con perfiles

`habilidades` llama a `GET /perfiles/me` reenviando el access token original. Los riesgos y controles son:

| Riesgo | Control recomendado |
|---|---|
| Token expuesto en logs | No registrar headers ni errores completos del cliente HTTP. |
| Perfiles no responde | Timeout corto, error controlado, métricas y experimento de caos. |
| Respuesta manipulada o incompleta | Validar esquema y exigir `colegioId` antes de usarla. |
| Acoplamiento síncrono | Como mejora, publicar `PerfilActualizado` y mantener una proyección local. |

#### IAM y limitación de AWS Academy

En AWS Academy, los servicios usan el rol preexistente `LabRole`, que normalmente es más amplio que el principio de mínimo privilegio. Esta limitación debe quedar documentada y no debe presentarse como el diseño objetivo de producción.

La política objetivo para `habilidades` debería permitir únicamente:

- Operaciones DynamoDB necesarias sobre `ceibbo-app-<stage>` y el índice `GSI1`.
- `sqs:SendMessage` sobre `EventsQueue`.
- Escritura de logs en el grupo de la función.
- `ssm:GetParameter` únicamente sobre el parámetro de caos del stage, si se usa `failure-lambda`.

No debería permitir administrar Cognito, eliminar tablas/colas, leer secretos de otros servicios ni asumir roles adicionales.

#### Evidencia mínima para la entrega

- Prueba de solicitud sin token: API Gateway responde 401.
- Prueba de estudiante intentando una ruta de colegio: responde 403.
- Prueba de colegio intentando validar un estudiante ajeno: responde 403.
- Prueba de habilidad inexistente: responde 404 sin filtrar información interna.
- Prueba de declaración duplicada: responde 409 y deja un único registro.
- Prueba de body inválido: responde 400.
- Evidencia de que los logs no contienen tokens ni datos personales completos.

#### Riesgo residual

| Riesgo | Probabilidad | Impacto | Nivel residual | Tratamiento |
|---|---|---|---|---|
| Uso excesivo de permisos por `LabRole` | Media | Alto | Alto | Aceptar solo en Academy; crear rol de mínimo privilegio para producción. |
| Abuso de endpoints autenticados | Media | Medio | Medio | Rate limiting, alarmas y WAF si el escenario lo justifica. |
| Caída del servicio perfiles | Media | Medio | Medio | Timeout, observabilidad, caos y futura proyección local. |
| Evento SQS duplicado | Media | Medio | Medio | Idempotencia por `eventId` en consumidores. |
| Exposición accidental en logs | Baja | Alto | Medio | Redacción, revisión automatizada y retención limitada. |

> Actualización del 22 de noviembre: la matriz de arriba es anterior a F2-15a y F2-01r. Desde entonces, el CORS compartido acepta solo `http://localhost:3000`, el stage tiene throttling (50 solicitudes por segundo, ráfaga de 100) y hay alarmas de 5xx, DLQ y throttles (ver la tabla de `infra/shared` y las secciones 7 y 8). Siguen pendientes la auditoría de validaciones, el WAF y el rol IAM propio.

### perfiles (Matías)

Una sola Lambda, `perfiles`, atiende las 7 rutas, todas con el autorizador JWT (`services/perfiles/serverless.yml:31-64`). Los archivos de la tabla son relativos a `services/perfiles/`.

| Ruta | Grupo | Dónde se comprueba | Validaciones | Permisos IAM mínimos ideales | Estado |
|---|---|---|---|---|---|
| `POST /perfiles` | sin grupo (registro); con grupo `colegio` o `empresa`, 403 | `src/application/registrarPerfil.mjs:7-11` | JSON válido; `nombre` y `apellido` obligatorios; solo los campos del estudiante, con largo máximo (`src/domain/Perfil.mjs:10-14`); `anio` entero de 1 a 7; `colegioId` tiene que existir y `especialidad` ser oficial del Mineduc y de ese colegio. Si no, 400. Perfil repetido: 409 (`Put` condicional) | `cognito-idp:AdminAddUserToGroup` sobre el user pool; `dynamodb:GetItem` y `dynamodb:PutItem` sobre la tabla | Implementado (`test/casosDeUso.test.mjs:55-73`) |
| `GET /perfiles/me` | todos, también sin grupo; cada uno el suyo | `src/application/obtenerPerfil.mjs:7`; el id sale del token | No recibe datos. Sin perfil: 404 y no 403, para que el recién registrado pueda crearlo | `dynamodb:GetItem` sobre la tabla | Implementado (`test/casosDeUso.test.mjs:95`) |
| `PUT /perfiles/me` | todos; cada uno el suyo | `src/application/actualizarPerfil.mjs:7-11` | Objeto JSON; lista blanca de campos por tipo, así `readinessScore`, `tipo` y `userId` se ignoran (`src/domain/Perfil.mjs:65-83`); obligatorios no vacíos; `sitioWeb` solo `http(s)`, para no guardar un `javascript:` (`src/domain/validaciones.mjs:21-35`); `colegioId` y `especialidad` como en el registro. Si no, 400. Sin perfil: 404 | `dynamodb:GetItem` y `dynamodb:UpdateItem` sobre la tabla | Implementado (`test/dominio.test.mjs:38-71`, `test/casosDeUso.test.mjs:102-147`) |
| `GET /colegios` | todos | `src/application/listarColegios.mjs:5` | No recibe datos. Devuelve solo `id`, `nombre` y `logo` (`src/adapters/out/dynamoRepositorioPerfiles.mjs:151-154`) | `dynamodb:Query` sobre el índice `GSI1` | Implementado (`test/casosDeUso.test.mjs:189`) |
| `GET /colegios/{id}/config` | todos: la personalización del colegio es pública | `src/application/obtenerConfigColegio.mjs:6` | Colegio inexistente: 404 | `dynamodb:GetItem` sobre la tabla | Implementado (`test/casosDeUso.test.mjs:160`) |
| `PUT /colegios/{id}/config` | colegio dueño | `src/application/comunes.mjs:17-26`: grupo `colegio` en el token **y** un perfil de ese mismo colegio. Si no, 403, antes de mirar si el colegio existe | `nombre` obligatorio; largos máximos; `colorPrincipal` con formato `#RRGGBB`; `sitioWeb` y `logo` solo `http(s)` o ruta interna, nunca `//otro-sitio`; hasta 20 especialidades oficiales (`src/domain/ConfigColegio.mjs:11-40`). Si no, 400. Colegio inexistente: 404 | `dynamodb:GetItem` y `dynamodb:PutItem` sobre la tabla | Implementado (`test/casosDeUso.test.mjs:165-185`, `test/dominio.test.mjs:81-116`) |
| `GET /colegios/{id}/estudiantes` | colegio dueño | `src/application/comunes.mjs:17-26`, la misma regla | No recibe cuerpo | `dynamodb:GetItem` sobre la tabla; `dynamodb:Query` sobre el índice `GSI1` | Implementado (`test/casosDeUso.test.mjs:210`) |

En todas las rutas:

- Sin token, el autorizador responde 401 antes de llegar a la Lambda. El usuario sale de los claims que ya validó el autorizador, nunca del cuerpo (`src/adapters/in/http.mjs:35-45`), y sin usuario la respuesta es 403 (`src/application/comunes.mjs:5-9`).
- Un error inesperado responde 500 sin detalles; el detalle queda solo en el log (`src/adapters/in/http.mjs:82-84`).
- Los valores del usuario llegan a DynamoDB como parámetros del SDK, nunca dentro del texto de la consulta, así que no hay inyección.

Rol ideal de la función `perfiles` (Diseñado; hoy usa LabRole):

- `dynamodb:GetItem`, `dynamodb:PutItem` y `dynamodb:UpdateItem` sobre `arn:aws:dynamodb:us-east-1:<cuenta>:table/ceibbo-app-<stage>`.
- `dynamodb:Query` sobre `arn:aws:dynamodb:us-east-1:<cuenta>:table/ceibbo-app-<stage>/index/GSI1`.
- `cognito-idp:AdminAddUserToGroup` sobre `arn:aws:cognito-idp:us-east-1:<cuenta>:userpool/<UserPoolId>`.
- `logs:CreateLogStream` y `logs:PutLogEvents` sobre su log group, `/aws/lambda/ceibbo-perfiles-<stage>-perfiles`.
- Ninguna ruta necesita `Scan`, `DeleteItem`, S3 ni SQS.

`AdminAddUserToGroup` se da sobre todo el user pool: hoy solo el código limita el grupo a `estudiante` (`src/application/registrarPerfil.mjs:18`). Diseño ideal: sacar `POST /perfiles` a una función propia, para que solo ella tenga ese permiso y las otras seis rutas no puedan cambiar grupos.

### notificaciones (Matías, F2-02)

Dos Lambdas: `notificaciones` atiende las 4 rutas, todas con el autorizador JWT, y `consumidor` lee la cola de eventos (`services/notificaciones/serverless.yml:32-66`). Los archivos de la tabla son relativos a `services/notificaciones/`.

| Ruta o evento | Grupo | Dónde se comprueba | Validaciones | Permisos IAM mínimos ideales | Estado |
|---|---|---|---|---|---|
| `GET /notifications` | todos, cada uno las suyas | `src/application/notificaciones.mjs:20-23`: solo se consulta la partición `NOTIF#<sub del token>` (`src/adapters/out/dynamoRepositorioNotificaciones.mjs:15`) | No recibe datos | `dynamodb:Query` sobre la tabla | Implementado (`test/http.test.mjs:30`) |
| `PATCH /notifications/read-all` | todos, cada uno las suyas | `src/application/notificaciones.mjs:31-34`, la misma partición | No recibe datos. El `Update` es condicional (`attribute_exists(PK)`): no revive una notificación borrada | `dynamodb:Query` y `dynamodb:UpdateItem` sobre la tabla | Implementado (`test/http.test.mjs:52`) |
| `PATCH /notifications/{id}/read` | dueño de la notificación | `src/adapters/out/dynamoRepositorioNotificaciones.mjs:43-52`: el `id` se busca solo dentro de la partición del usuario. Una ajena da 404 y no 403, así no se sabe si existe | El `id` solo se compara en un filtro. Si no existe, 404 | `dynamodb:Query` y `dynamodb:UpdateItem` sobre la tabla | Implementado (`test/http.test.mjs:45`) |
| `DELETE /notifications/{id}` | dueño de la notificación | Igual que la anterior (`src/adapters/out/dynamoRepositorioNotificaciones.mjs:116-130`) | `Delete` condicional. Si no existe, 404 | `dynamodb:Query` y `dynamodb:DeleteItem` sobre la tabla | Implementado (`test/http.test.mjs:60`) |
| Consumidor de `EventsQueue` (SQS) | no aplica: lo invoca SQS, no tiene ruta HTTP | `src/adapters/in/sqs.mjs:18-35` | JSON válido; `version` 1; `id`, `fecha` válida y `destinatarioId` obligatorios; los campos de `datos` que pide el contrato (`src/domain/Notificacion.mjs:34-45`). Un mensaje inválido se reintenta y después de 5 intentos pasa a la DLQ. Tipo desconocido: se ignora. Repetido: no se duplica (`Put` condicional, `src/adapters/out/dynamoRepositorioNotificaciones.mjs:77-93`) | `sqs:ReceiveMessage`, `sqs:DeleteMessage` y `sqs:GetQueueAttributes` sobre `EventsQueue`; `dynamodb:PutItem` sobre la tabla | Implementado (`test/sqs.test.mjs:15-59`, `test/dominio.test.mjs:30-51`). Probado en rol3: el mismo evento enviado dos veces dio `creada` y después `duplicado` |

En las 4 rutas:

- Sin token, el autorizador responde 401. El usuario es el `sub` de los claims ya validados (`src/adapters/in/http.mjs:7-12`) y sin usuario la respuesta es 403 (`src/application/notificaciones.mjs:6-8`, prueba en `test/http.test.mjs:69`).
- No se exige grupo, porque los tres actores reciben notificaciones.
- Un error inesperado responde 500 sin detalles (`src/adapters/in/http.mjs:39-42`, prueba en `test/http.test.mjs:81`).

Rol ideal (Diseñado; hoy las dos usan LabRole). Con un rol por función, ninguna tiene los permisos de la otra:

- `notificaciones`: `dynamodb:Query`, `dynamodb:UpdateItem` y `dynamodb:DeleteItem` sobre `arn:aws:dynamodb:us-east-1:<cuenta>:table/ceibbo-app-<stage>`; `logs:CreateLogStream` y `logs:PutLogEvents` sobre `/aws/lambda/ceibbo-notificaciones-<stage>-notificaciones`. No puede leer la cola ni crear notificaciones.
- `consumidor`: `sqs:ReceiveMessage`, `sqs:DeleteMessage` y `sqs:GetQueueAttributes` sobre el ARN de `EventsQueue` (output `EventsQueueArn` de `infra/shared`); `dynamodb:PutItem` sobre la tabla; `logs:CreateLogStream` y `logs:PutLogEvents` sobre `/aws/lambda/ceibbo-notificaciones-<stage>-consumidor`. No puede leer, marcar ni borrar notificaciones.

La cola no tiene una política propia (`infra/shared/serverless.yml:52-58`): cualquiera con permisos de SQS en la cuenta puede publicar en ella, y el consumidor confía en el `destinatarioId` del mensaje. Diseño ideal: una política de la cola que deje `sqs:SendMessage` solo a los roles de postulaciones y habilidades.

### infra/shared (José)

| Recurso | Control que tiene hoy | Estado | Diseño ideal |
|---|---|---|---|
| Tabla `ceibbo-app-<stage>` | Cifrado por defecto de DynamoDB | Implementado por AWS | Claves propias en KMS si hay que controlarlas; acceso solo desde los roles de cada función (sección 11) |
| Bucket de archivos | Bloqueo total de acceso público (`:37-41`); CORS solo `http://localhost:3000` (`:42-46`) | Implementado (F2-15a) | URLs firmadas de corta duración (sección 6) y una política del bucket que rechace lo que no llegue por HTTPS (`aws:SecureTransport`) |
| `EventsQueue` y `EventsDLQ` | DLQ tras 5 intentos (`:56-58`); alarma si llega algo a la DLQ (`:158-172`) | Implementado | Política de la cola que deje `sqs:SendMessage` solo a postulaciones y habilidades (ver notificaciones) |
| User pool y app client | Ver sección 3 | Implementado | Ver sección 3 |
| HTTP API y stage | Autorizador JWT (`:126-138`); CORS solo `http://localhost:3000` (`:109`); throttling de 50 solicitudes por segundo y ráfaga de 100 (`:121-123`); alarma de 5xx (`:142-156`) | Implementado (F2-15a y F2-01r) | WAF con CloudFront o REST API (sección 10); límites más bajos para las rutas de escritura |
| Alarmas | 5xx del API, mensajes en la DLQ y throttles de postulaciones (`:140-188`) | Implementado (F2-01r) | Una acción SNS que avise al equipo por correo; hoy el estado se mira en la consola |

## 3. Identidad (Cognito)

Hoy en el código:

- El user pool usa el **correo como usuario** y lo verifica con un código antes de activar la cuenta (`infra/shared/serverless.yml:60-71`).
- Hay **tres grupos**: `estudiante`, `empresa` y `colegio`. El grupo viaja dentro del token, en el claim `cognito:groups` (`:83-100`).
- El app client **no tiene secreto**, porque lo usa un frontend público. Permite SRP, refresh y `ALLOW_USER_PASSWORD_AUTH`, este último "solo para tokens de prueba" (`:73-81`).
- **Vida de los tokens:** el client no la configura, así que rigen los valores por defecto de Cognito: 1 hora el de acceso y el de identidad, 30 días el de refresco. Confirmar en la consola.
- **Contraseñas:** rige la política por defecto (8 caracteres, con mayúscula, minúscula, número y símbolo). Es el mismo mensaje que muestra el registro en `frontend/src/lib/cognito.ts`.
- **MFA:** no está configurado.
- El login responde el **mismo mensaje** si el correo no existe o si la contraseña está mal, para no revelar qué correos tienen cuenta (`frontend/src/lib/cognito.ts`).
- El frontend maneja la sesión con Amplify. Por defecto, Amplify guarda los tokens en el `localStorage` del navegador. Confirmar.

Para cerrar el diseño (F2-06b):

- Desactivar `ALLOW_USER_PASSWORD_AUTH` en `demo` con un parámetro por stage. Hoy no se puede, porque `scripts/aws/token.sh` y las mediciones del canario dependen de él (plan de cierre, F2-15a).
- ¿MFA para las cuentas de colegio y empresa?
- ¿Tokens de acceso más cortos y revocación del refresco al cerrar sesión?

## 4. Autorización y validación

Hoy en el código:

- El **autorizador JWT** revisa la firma, el emisor (el user pool) y la audiencia (el app client) antes de invocar la Lambda. Sin token válido, API Gateway responde 401 y la Lambda no se ejecuta (`infra/shared/serverless.yml:126-138`).
- **Todas las rutas** pasan por el autorizador, salvo `GET /health`, que es pública a propósito.
- El **grupo y el dueño** los revisa cada servicio leyendo `cognito:groups`: `services/perfiles/src/adapters/in/http.mjs:43`, `services/habilidades/src/adapters/in/http.js:20` y `services/postulaciones/src/adapters/in/http.mjs:12`. El detalle por ruta va en la sección 2.
- Los **mensajes de la cola** tienen contrato en `contracts/eventos/*.json` (JSON Schema). Falta confirmar si alguien los valida al recibirlos. En notificaciones (F2-02), un mensaje inválido vuelve en `batchItemFailures` y termina en la DLQ.

Material del ramo: el manual de Serverless (sección 8) pide validar los *payloads* "para entradas HTTP y mensajes".

## 5. Cifrado

- **En tránsito:** API Gateway solo expone HTTPS, y el SDK de AWS habla por HTTPS con DynamoDB, SQS, S3 y Cognito. Implementado por AWS.
- **En reposo:** `infra/shared/serverless.yml` no configura cifrado, así que rigen los valores por defecto de AWS. DynamoDB cifra siempre, S3 cifra los objetos nuevos con SSE-S3 y SQS cifra las colas nuevas con SSE-SQS. Implementado por AWS, con claves de AWS. Confirmar en la consola de cada servicio y guardar una captura.
- **Diseñado:** claves propias en KMS. El manual de Serverless dice "activa KMS donde aplique (S3, SQS, DynamoDB, Secrets)".

## 6. Archivos y URLs firmadas

- El bucket **bloquea todo acceso público** (`infra/shared/serverless.yml:37-41`). Implementado.
- Su CORS permite `PUT` y `GET` solo desde `http://localhost:3000` (`:42-46`), desde F2-15a.
- **No hay código que genere URLs firmadas.** La subida de evidencias con URL firmada (patrón Valet Key) queda como diseño (plan de cierre, sección 7, F2-16).
- Para cerrar el diseño: qué servicio firma la URL, cuánto dura y bajo qué ruta del bucket queda cada archivo.

## 7. CORS

- **Implementado (F2-15a):** `AllowOrigins: ['http://localhost:3000']` en el API (`infra/shared/serverless.yml:109`) y en el bucket (`:45`). Antes era `'*'`. Los métodos y las cabeceras ya estaban acotados (`:110-111`).
- El frontend corre en local, por eso el único origen es `http://localhost:3000`. Si se publica (Amplify o Vercel), se agrega ese dominio.
- CORS solo lo aplican los navegadores. Postman o `curl` lo ignoran, así que no es control de acceso: lo que protege de verdad es el autorizador JWT.

## 8. Throttling

- **Implementado (F2-15a):** el stage define `ThrottlingRateLimit: 50` y `ThrottlingBurstLimit: 100` para todas sus rutas (`infra/shared/serverless.yml:121-123`). Son valores propuestos por el equipo, no de una fuente.
- Antes solo regía el límite de la cuenta: según AWS, 10.000 solicitudes por segundo con una ráfaga de 5.000, compartidas por todas las APIs de la cuenta en la región. Un solo cliente podía gastarse esa cuota.
- Lo que pasa del límite recibe `429 Too Many Requests` y no llega a la Lambda, así que tampoco gasta invocaciones.
- Para medir: la prueba de carga (F2-14) muestra si el límite interfiere con el uso normal.
- Material del ramo: la guía del Control 1 define throttling como la "limitación de la tasa de solicitudes procesadas".

## 9. Secretos

Hoy en el código:

- **No hay secretos en el repositorio.** Las variables de entorno de las Lambdas son nombres de recursos: `TABLE_NAME`, `EVENTS_QUEUE_URL`, `USER_POOL_ID` y `API_BASE_URL`.
- Los ids de Cognito del frontend son públicos por diseño, porque el app client no tiene secreto.
- Los `.env` y `.env.local` están ignorados (`.gitignore:13-23`).
- La contraseña de prueba solo entra por la variable `CEIBBO_TEST_PASSWORD` (`scripts/aws/token.sh`).
- El CI usa credenciales falsas, solo para DynamoDB local (`.github/workflows/ci.yml:57-60`).

Diseñado: si aparece un secreto real (por ejemplo, la llave de un servicio de correo), va en Secrets Manager o en SSM Parameter Store y se referencia con `${ssm:/ruta}`. La guía del Control 1 lo pide así: "Prohibición de credenciales hardcodeadas; uso obligatorio de AWS Secrets Manager o Parameter Store".

## 10. WAF

- Hoy no hay WAF.
- El HTTP API no se conecta directo con AWS WAF. El manual de Serverless (sección 9) lo pone entre lo que el HTTP API no trae: "API keys, WAF, validación".
- Para cerrar el diseño: poner CloudFront con WAF delante del API, o cambiar a REST API. Comparar el costo con Ian (costos y justificación del HTTP API).

## 11. Mínimo privilegio y LabRole

- Hoy **todas las Lambdas usan LabRole** (`role` en cada `services/*/serverless.yml`). En el Learner Lab no se pueden crear roles: el LAB de Desarrollo Cloud indica usar `Role: LabRole` y no usar `Policies`.
- LabRole tiene más permisos de los que necesita cada función. Si una Lambda se compromete, podría tocar recursos que no son suyos.
- Diseñado: **un rol por función**, con solo las acciones y los recursos de la sección 2. La guía del Control 1 lo pide así: "políticas de mínimo privilegio acotadas estrictamente a las acciones y recursos necesarios".

## 12. Comunicación entre servicios

- Hoy habilidades llama a `GET /perfiles/me` **reenviando el token del usuario** (`services/habilidades/src/adapters/out/httpLectorPerfiles.js:15`). Pasa por el autorizador como cualquier usuario.
- Diseñado: la guía del Control 1 pide "IAM SigV4 para comunicaciones machine-to-machine". La otra opción es la de `docs/patrones.md` (sección 3.4): un evento `PerfilActualizado` y una copia local del dato.

## 13. CI/CD y credenciales

- Hoy el CI **no despliega**: corre lint, type-check y pruebas. El token de GitHub solo puede leer el repositorio (`permissions: contents: read`, `.github/workflows/ci.yml:11-13`).
- No guarda credenciales de AWS, porque las del Learner Lab duran unas 4 horas (`.github/workflows/ci.yml:3`).
- Diseñado: **OIDC** entre GitHub Actions y AWS. GitHub asume un rol y recibe credenciales temporales en cada despliegue, sin llaves guardadas. Necesita crear un rol IAM, y eso no se puede en el Learner Lab. El workflow opcional `deploy.yml` (F2-12b, Ian) se relaciona con esto.

## 14. Limitaciones del Learner Lab y su solución

| Limitación | Efecto en la seguridad | Solución en una cuenta real |
|---|---|---|
| No se pueden crear roles | Todas las funciones comparten LabRole | Un rol por función con mínimo privilegio (sección 11) |
| Credenciales temporales de unas 4 horas | El CI no puede desplegar | OIDC entre GitHub y AWS (sección 13) |
| `token.sh` y el canario necesitan `USER_PASSWORD_AUTH` | Ese flujo queda abierto también en `demo` | Parámetro por stage que lo apague en `demo` (sección 3) |

## 15. Riesgos de seguridad

Alimenta la tabla 4.1 del informe, que pide estas mismas columnas.

| ID | Riesgo | Probabilidad | Impacto | Mitigación | Relación con experimento de caos |
|---|---|---|---|---|---|
| RS-01 | | | | | |
| RS-02 | | | | | |
| RS-03 | | | | | |

Candidatos: robo del token desde el navegador, permisos amplios de LabRole, CORS abierto, ráfaga de solicitudes sin throttling y el flujo `USER_PASSWORD_AUTH` en `demo`.

## Fuentes

- Material del ramo: guía de estudio del Control 1 (sección 3.4, Seguridad); manual de Serverless Framework (secciones 8 y 9); manual de AWS SAM (buenas prácticas de seguridad); LAB de Desarrollo Cloud (LabRole).
- Documentación de AWS por citar en APA (F2-19b): vida de los tokens de Cognito, cifrado en reposo de DynamoDB, cifrado por defecto de S3, cifrado de SQS, throttling del HTTP API y recursos que protege AWS WAF.
- Throttling del HTTP API: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-throttling.html y límite de la cuenta (10.000 por segundo, ráfaga de 5.000): https://repost.aws/knowledge-center/api-gateway-429-limit
- Condición `dynamodb:LeadingKeys` (acceso por clave de partición): https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/specifying-conditions.html
- Alarmas de CloudFormation: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-cloudwatch-alarm.html
