# Diseño de seguridad de Ceibbo

Plantilla de la tarea F2-06a (Rol 3). Junta en un solo lugar cada control de seguridad, dice si está **Implementado** o **Diseñado** y con qué se demuestra. El examen pide distinguir las dos cosas.

- **Implementado:** está en el código o en la configuración y se puede mostrar. Lleva evidencia: archivo y línea (`infra/shared/serverless.yml:122`) o una captura.
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
| 2 | Autorizador JWT en el API | Que nadie sin token llegue a una Lambda | Implementado | `infra/shared/serverless.yml:121-133` y cada `services/*/serverless.yml` |
| 3 | Autorización por grupo y por dueño | Que cada actor haga solo lo suyo | Por confirmar en la sección 2 | Adaptador de entrada de cada servicio |
| 4 | Validación de entradas HTTP | Datos malformados o maliciosos | Por confirmar en la sección 2 | Dominio de cada servicio |
| 5 | Validación de mensajes de la cola | Mensajes con formato inválido | Por confirmar | Los contratos existen en `contracts/eventos/*.json` |
| 6 | Cifrado en tránsito | Que nadie lea el tráfico | Implementado por AWS | Sección 5 |
| 7 | Cifrado en reposo | Los datos guardados | Implementado por AWS (claves de AWS) | Sección 5. Claves propias en KMS: Diseñado |
| 8 | URLs firmadas para archivos | Subir y bajar archivos sin abrir el bucket | Diseñado | Sección 6 |
| 9 | CORS restringido | Que otro sitio no use la API desde un navegador | Diseñado, pasa a Implementado con F2-15a | Hoy `'*'` en `infra/shared/serverless.yml:45` y `:109` |
| 10 | Throttling | Ráfagas y abuso | Diseñado, pasa a Implementado con F2-15a | `infra/shared/serverless.yml:113-118` no tiene límites |
| 11 | Secretos fuera del código | Credenciales | Implementado (no hay secretos en el repositorio) | Sección 9. Secrets Manager: Diseñado |
| 12 | WAF | Ataques web comunes | Diseñado | Sección 10 |
| 13 | Mínimo privilegio en IAM | Que una Lambda comprometida no pueda tocarlo todo | Diseñado (hoy todas usan LabRole) | Sección 11 |
| 14 | Comunicación entre servicios | Las llamadas internas | Diseñado (hoy se reenvía el token del usuario) | Sección 12 |
| 15 | CI/CD sin credenciales guardadas (OIDC) | Que no se filtren llaves de AWS | Diseñado (hoy el CI no despliega) | Sección 13 |

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
| `GET /health` | público, a propósito | | | | |
| `GET /health/privado` | cualquiera con token | | | | |

### postulaciones (José)

| Ruta | Grupo | Dónde se comprueba | Validaciones | Permisos IAM mínimos ideales | Estado |
|---|---|---|---|---|---|
| `POST /oportunidades` | empresa | | | | |
| `GET /oportunidades` (canario, alias `live`) | todos | | | | |
| `GET /oportunidades/mias` | empresa | | | | |
| `POST /oportunidades/{id}/postulaciones` | estudiante | | | | |
| `GET /oportunidades/{id}/postulaciones` | empresa dueña | | | | |
| `GET /postulaciones/mias` | estudiante | | | | |

`GET /oportunidades` no está en `serverless.yml`: la crea `scripts/canario/canario-servicio.sh` (D-03), también con el autorizador JWT (líneas 128-144).

### habilidades (Ian)

| Ruta | Grupo | Dónde se comprueba | Validaciones | Permisos IAM mínimos ideales | Estado |
|---|---|---|---|---|---|
| `POST /habilidades` | estudiante | | | | |
| `GET /habilidades/me` | estudiante | | | | |
| `GET /habilidades/pendientes` | colegio | | | | |
| `PATCH /habilidades/{estudianteId}/{habilidadId}` | colegio dueño | | | | |

### perfiles (Matías)

| Ruta | Grupo | Dónde se comprueba | Validaciones | Permisos IAM mínimos ideales | Estado |
|---|---|---|---|---|---|
| `POST /perfiles` | sin grupo (registro) | | | | |
| `GET /perfiles/me` | todos | | | | |
| `PUT /perfiles/me` | todos | | | | |
| `GET /colegios` | todos | | | | |
| `GET /colegios/{id}/config` | todos | | | | |
| `PUT /colegios/{id}/config` | colegio dueño | | | | |
| `GET /colegios/{id}/estudiantes` | colegio dueño | | | | |

### notificaciones (Matías, F2-02)

| Ruta o evento | Grupo | Dónde se comprueba | Validaciones | Permisos IAM mínimos ideales | Estado |
|---|---|---|---|---|---|
| `GET /notifications` | todos, cada uno las suyas | | | | |
| `PATCH /notifications/read-all` | todos, cada uno las suyas | | | | |
| `PATCH /notifications/{id}/read` | dueño de la notificación | | | | |
| `DELETE /notifications/{id}` | dueño de la notificación | | | | |
| Consumidor de `EventsQueue` (SQS) | no aplica: lo invoca SQS | | | | |

### infra/shared (José)

| Recurso | Control que tiene hoy | Estado | Diseño ideal |
|---|---|---|---|
| Tabla `ceibbo-app-<stage>` | Cifrado por defecto de DynamoDB | Implementado por AWS | |
| Bucket de archivos | Bloqueo total de acceso público (`:37-41`); CORS `'*'` (`:42-46`) | Implementado / Diseñado | |
| `EventsQueue` y `EventsDLQ` | DLQ tras 5 intentos (`:56-58`) | Implementado | |
| User pool y app client | Ver sección 3 | Implementado | |
| HTTP API y stage | Autorizador JWT; CORS `'*'`; sin throttling | Implementado / Diseñado | |

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

- El **autorizador JWT** revisa la firma, el emisor (el user pool) y la audiencia (el app client) antes de invocar la Lambda. Sin token válido, API Gateway responde 401 y la Lambda no se ejecuta (`infra/shared/serverless.yml:121-133`).
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
- Su CORS permite `PUT` y `GET` desde cualquier origen (`:42-46`). Se restringe en F2-15a.
- **No hay código que genere URLs firmadas.** La subida de evidencias con URL firmada (patrón Valet Key) queda como diseño (plan de cierre, sección 7, F2-16).
- Para cerrar el diseño: qué servicio firma la URL, cuánto dura y bajo qué ruta del bucket queda cada archivo.

## 7. CORS

- Hoy: `AllowOrigins: ['*']` en el API (`infra/shared/serverless.yml:109`) y en el bucket (`:45`). Los métodos y las cabeceras ya están acotados (`:110-111`).
- F2-15a (José) cambia `'*'` por el origen del frontend, `http://localhost:3000`.
- CORS solo lo aplican los navegadores. Postman o `curl` lo ignoran, así que no es control de acceso: lo que protege de verdad es el autorizador JWT.

## 8. Throttling

- Hoy: el stage (`infra/shared/serverless.yml:113-118`) no define límites, así que rigen los límites por defecto de la cuenta. Confirmar el valor en la documentación de AWS.
- F2-15a (José) agrega `ThrottlingRateLimit: 50` y `ThrottlingBurstLimit: 100`. Son valores propuestos por el equipo, no de una fuente. Lo que pase del límite recibe un 429.
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
