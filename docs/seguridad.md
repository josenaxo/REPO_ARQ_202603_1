# Diseño de seguridad

## 1. Alcance y criterio

La matriz identifica los activos, amenazas, controles existentes, evidencia y riesgo residual de cada servicio. Los controles se evalúan en API Gateway, Lambda, Cognito, DynamoDB, SQS y el código del dominio.

## 2. Seguridad por servicio

### Habilidades (Ian)

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

