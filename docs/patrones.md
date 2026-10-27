# Patrones de diseño en Ceibbo

Cada patrón con el problema que resuelve, dónde está en el repositorio y cómo reconocerlo.
Los nombres siguen el material del ramo (guía de microservicios, guía de estudio del Control 1, clases de DevOps)
y las fuentes al final.

## 1. Arquitectura interna de cada servicio

### 1.1 Arquitectura hexagonal (puertos y adaptadores) · Clean Architecture
- **Problema:** que la lógica del negocio no dependa de AWS, para poder probarla sin la nube y cambiar la tecnología sin reescribirla.
- **Dónde:** los 4 servicios tienen la misma estructura, que nace de la plantilla `services/health` (B1-03):
  - `src/domain/` reglas del negocio, sin `import` de AWS (`Oportunidad.mjs`, `Postulacion.mjs`, `Perfil.mjs`, `HabilidadEstudiante.js`);
  - `src/application/` casos de uso (`postulaciones.mjs`, `registrarPerfil.mjs`, `servicioHabilidades.js`, `verificarSalud.mjs`);
  - `src/ports/` lo que el caso de uso necesita del exterior (`RepositorioPostulaciones.mjs`, `PublicadorEventos.mjs`, `ServicioIdentidad.mjs`, `LectorPerfiles.js`);
  - `src/adapters/in/` entrada HTTP y `src/adapters/out/` DynamoDB, SQS, Cognito y HTTP.
- **Cómo se nota:** las dependencias apuntan hacia adentro. `domain/` no importa nada de `adapters/`.

### 1.2 Inyección de dependencias y raíz de composición
- **Problema:** que el caso de uso reciba sus herramientas en vez de crearlas, para cambiarlas por dobles en las pruebas.
- **Dónde:** `crearHandler(deps)` en `services/*/src/adapters/in/http.*`. El `export const handler = crearHandler({ repositorio, publicador, generarId, reloj })` es el único lugar donde se conectan los adaptadores reales.
- Los casos de uso tienen la firma `(deps, { actor, ... })`. Hasta el reloj y el generador de ids se inyectan, así las pruebas son predecibles.

### 1.3 Repository
- **Problema:** esconder cómo se guarda cada dato (claves PK/SK, índices, paginación) detrás de métodos con nombre del negocio.
- **Dónde:** puerto `RepositorioPostulaciones.mjs` (`guardarOportunidad`, `crearPostulacion`, `listarPostulantes`…) y adaptador `dynamoRepositorioPostulaciones.mjs`. Lo mismo en perfiles (`dynamoRepositorioPerfiles.mjs`) y habilidades (`dynamoRepositorioHabilidades.js`).
- `comprobarPuerto.mjs` revisa al iniciar que el adaptador tenga todos los métodos del puerto (un contrato en JavaScript, que no tiene interfaces).

### 1.4 Adapter
- **Problema:** traducir entre el formato de un sistema externo y el del dominio.
- **Dónde:** `adapters/in/http.mjs` traduce el evento de API Gateway (claims del JWT, `pathParameters`, `queryStringParameters`, body en base64) a una llamada al caso de uso, y el resultado o `ErrorDominio` a un código HTTP. En el frontend, `frontend/src/lib/api/postulaciones.ts` traduce los campos en español del contrato a los tipos de las pantallas.

### 1.5 Dobles de prueba en memoria (Test Double / Fake)
- **Dónde:** `services/postulaciones/test/dobles.mjs`, `services/perfiles/test/dobles/enMemoria.mjs`. Implementan los mismos puertos sin AWS.
- **Resultado:** 93 pruebas unitarias que corren en menos de un segundo y en el CI.

## 2. Datos

### 2.1 Diseño de tabla única (single-table design) con colecciones de ítems
- **Problema:** responder cada patrón de acceso con una sola consulta, sin joins.
- **Dónde:** `docs/datos/*.md`. Una oferta y sus postulaciones comparten la partición `OPPORTUNITY#<id>` (SK `DETAIL` y `APPLICATION#<estudianteId>`), así que "postulantes de una oferta" es un solo `Query`.

### 2.2 Índice secundario sobrecargado y disperso (GSI sparse)
- **Dónde:** `GSI1` guarda patrones distintos según el prefijo: `OPPORTUNITIES`, `STUDENT#<id>`, `SCHOOL#<id>`, `SCHOOLS`. Solo los ítems que necesitan el índice tienen `GSI1PK` (por ejemplo, en perfiles solo los estudiantes con colegio).

### 2.3 Base de datos por servicio (lógica)
- La tabla es compartida (`ceibbo-app-<stage>`), pero cada servicio es dueño de sus prefijos de clave y solo él los lee o escribe (plan, sección 6.4). Otro servicio que necesita esos datos los pide por API (habilidades → `GET /perfiles/me`).

### 2.4 Idempotencia con escritura condicional
- **Problema:** con reintentos y entrega "al menos una vez", la misma operación puede llegar dos veces.
- **Dónde:** `ConditionExpression: 'attribute_not_exists(PK)'` en `dynamoRepositorioPostulaciones.mjs` (postular dos veces → 409, sin duplicar), `dynamoRepositorioPerfiles.mjs` (registrarse dos veces) y `dynamoRepositorioHabilidades.js`.

### 2.5 Paginación completa
- `consultarTodo` en los repositorios sigue pidiendo páginas con `LastEvaluatedKey` hasta traer todo (DynamoDB corta cada respuesta en 1 MB).

## 3. Integración entre servicios

### 3.1 API Gateway (punto de entrada único) con autorizador JWT
- **Dónde:** `infra/shared/serverless.yml` crea un solo HTTP API y el `CognitoAuthorizer`. Cada servicio agrega sus rutas a esa API (`httpApi.id: ${cf:ceibbo-shared-<stage>.HttpApiId}`). Sin token, API Gateway responde 401 antes de invocar la Lambda.

### 3.2 Arquitectura orientada a eventos con cola y DLQ
- **Problema:** avisar a otros servicios sin esperarlos ni depender de que estén arriba.
- **Dónde:** al postular se publica `PostulacionCreada` y al validar una habilidad `HabilidadValidada` (`adapters/out/sqsPublicadorEventos.*`) en `EventsQueue`. Tras 5 intentos fallidos el mensaje pasa a `EventsDLQ` (`RedrivePolicy` con `maxReceiveCount: 5` en `infra/shared/serverless.yml`), así no se pierde.
- Los eventos tienen contrato propio en `contracts/eventos/*.json` (JSON Schema) y un `id` para que el consumidor sea idempotente.

### 3.3 Contrato primero (contract-first)
- Las APIs se definen antes del código en `contracts/api/*.yaml` (OpenAPI 3) y el frontend tiene una función por ruta del contrato (`frontend/src/lib/api/*.ts`).

### 3.4 Llamada síncrona entre servicios (con su costo)
- habilidades lee el colegio del estudiante con `GET /perfiles/me` (`httpLectorPerfiles.js`, puerto `LectorPerfiles.js`). Es simple, pero acopla: si perfiles cae, habilidades falla. Alternativa de fase 2: un evento `PerfilActualizado` y una copia local del dato.

## 4. Despliegue

### 4.1 Despliegue canario con alias ponderado
- **Problema:** liberar una versión nueva a una parte de los usuarios, medirla y poder volver atrás al instante.
- **Dónde:** `GET /oportunidades` apunta al alias `live` de la función postulaciones (`scripts/canario/canario-servicio.sh`, decisión D-03). `scripts/canario/canario-pesos.sh` mueve el peso (`canary 10`, `canary 50`, `promover`, `revertir`). La cabecera `X-App-Version` y `generar_carga.js` miden errores y p95 por versión. Resultados en `docs/canario.md`.

### 4.2 Infraestructura como código
- Toda la infraestructura está en `infra/shared/serverless.yml` y `services/*/serverless.yml`, que Serverless traduce a CloudFormation. Así existen 4 ambientes iguales (`rol1`, `rol2`, `rol3`, `demo`).

### 4.3 Plantilla de servicio
- `services/health` es la referencia que copia cada servicio nuevo (misma estructura, pruebas y `serverless.yml`).

## 5. Migración

### 5.1 Strangler Fig
- El monolito NestJS original (`backend/`, tag `v0.0-monolito`) se reemplaza por servicios uno a uno, y el frontend cambia ruta por ruta a los servicios nuevos (B2-06).

## 6. Patrones del ramo que todavía no aplicamos

| Patrón | Para qué sirve | Por qué no está aún |
|---|---|---|
| Outbox | Guardar la postulación y el evento en la misma transacción | Hoy, si la cola falla, la postulación se guarda y el error se registra (`postular` en `application/postulaciones.mjs`). Fase 2 |
| Circuit Breaker | Dejar de llamar a un servicio caído | Aplicaría a habilidades → perfiles. Fase 2 |
| Saga | Transacciones entre varios servicios | Ningún flujo actual escribe en más de un servicio |
| Retry con backoff exponencial | Reintentar sin saturar | Lo hacen el SDK de AWS y la redrive de SQS; no hay reintentos propios |

## Fuentes

- Material del ramo: guía de aprendizaje sobre microservicios (patrones API Gateway, Circuit Breaker, Event-Driven, Saga); guía de estudio del Control 1 (idempotencia, DLQ, retry, circuit breaker); clases de las semanas 7 a 10 (IaC, CI/CD) y guía del laboratorio de despliegue canario.
- Cockburn, A. (2005). *Hexagonal architecture*. https://alistair.cockburn.us/hexagonal-architecture/
- Fowler, M. (2004). *StranglerFigApplication*. https://martinfowler.com/bliki/StranglerFigApplication.html
- Amazon Web Services. (s. f.). *Best practices for designing and architecting with DynamoDB*. https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html
- Amazon Web Services. (s. f.). *Implement Lambda canary deployments using a weighted alias*. https://docs.aws.amazon.com/lambda/latest/dg/configuring-alias-routing.html
- Richardson, C. (2019). *Microservices patterns*. Manning.
