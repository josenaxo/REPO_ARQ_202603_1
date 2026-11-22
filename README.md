# Ceibbo

> La red profesional para talento técnico-profesional. Conecta estudiantes, colegios y empresas.

Proyecto del ramo Arquitectura de Sistemas (UDD, 2026). Equipo: José Ignacio Saavedra (Rol 1, plataforma y datos),
Ian Spikin (Rol 2, entrega continua y resiliencia) y Matías Vergara (Rol 3, experiencia, seguridad y gestión).

## Qué es

Ceibbo es una plataforma para colegios técnico-profesionales chilenos:

1. **Estudiantes** arman su perfil, declaran habilidades y postulan a prácticas y trabajos.
2. **Empresas** publican ofertas y revisan postulantes.
3. **Colegios** personalizan su espacio (color, logo, especialidades) y validan las habilidades de sus estudiantes.

## Arquitectura

El sistema se está migrando de un monolito NestJS + PostgreSQL (carpeta `backend/`, tag `v0.0-monolito`) a microservicios
serverless en AWS, uno por dominio (patrón Strangler Fig).

```
Next.js (frontend) ──► API Gateway HTTP API ──► autorizador JWT (Cognito)
                              │
     ┌───────────┬────────────┼──────────────┬────────────────┐
  health     perfiles    habilidades  postulaciones*   notificaciones
 (Lambda)    (Lambda)     (Lambda)       (Lambda)         (Lambda)
     └───────────┴────────────┼──────────────┴────────────────┘
                   DynamoDB (tabla única)

habilidades y postulaciones ──► SQS EventsQueue ──► consumidor de notificaciones
                                       └──► EventsDLQ (después de 5 fallos)

* GET /oportunidades va por el alias "live" de la Lambda (despliegue canario).
```

| Servicio | Rol | Responsabilidad | Eventos que publica |
|---|---|---|---|
| `services/health` | 1 | Plantilla hexagonal y estado del sistema | — |
| `services/perfiles` | 3 | Registro, perfil, colegios y su personalización | — |
| `services/habilidades` | 2 | Declarar y validar habilidades | `HabilidadValidada` |
| `services/postulaciones` | 1 | Ofertas de empresas y postulaciones | `PostulacionCreada` |
| `services/notificaciones` | 3 | Avisos de los tres actores, creados a partir de los eventos de la cola | — (consume `PostulacionCreada` y `HabilidadValidada`) |

Cada servicio sigue arquitectura hexagonal (`domain`, `application`, `ports`, `adapters`). El detalle de los patrones está en
[`docs/patrones.md`](docs/patrones.md) y la lista de las 23 rutas en [`docs/endpoints.md`](docs/endpoints.md).

**Tecnologías:** Node.js 22 (JavaScript ESM), AWS Lambda, API Gateway HTTP API, DynamoDB, SQS con DLQ, Cognito,
Serverless Framework v4 (CloudFormation), GitHub Actions, Docker (DynamoDB Local), Next.js 14.

## Estructura del repositorio

```
infra/shared/          Tabla, colas, Cognito, HTTP API y autorizador (compartido por todos los servicios)
services/<servicio>/   Un microservicio: src/{domain,application,ports,adapters}, test/, serverless.yml
contracts/api/         OpenAPI de cada servicio
contracts/eventos/     JSON Schema de cada evento
docs/                  Decisiones, modelo de datos, canario, patrones, endpoints, seguridad y colección de Postman
scripts/aws/           Usuarios y tokens de prueba
scripts/canario/       Despliegue canario (alias live, pesos y generador de carga)
scripts/local/         Tabla y datos de prueba para DynamoDB Local
frontend/              Next.js
backend/               Monolito anterior, solo como referencia (ver backend/README.md)
.github/workflows/     Integración continua
```

## Ambientes

Cada integrante tiene su stage (`rol1`, `rol2`, `rol3`) en el AWS Academy Learner Lab. `demo` es lo que ve el profesor
y solo se despliega desde `main`, en los releases.

- API de demo: `https://swf77ilyni.execute-api.us-east-1.amazonaws.com`
- Usuarios de prueba: `estudiante@ceibbo.cl`, `empresa@ceibbo.cl` y `colegio@ceibbo.cl` (contraseña fuera del repositorio).

## Cómo trabajar

### Pruebas

```bash
cd services/postulaciones && npm ci && npm test      # igual en cada servicio
npm install && npm run local:up                       # DynamoDB Local en Docker, en la raíz
```

El CI (`.github/workflows/ci.yml`) corre en cada push: lint y tipos del frontend, y para cada servicio las pruebas
unitarias y las de integración contra DynamoDB Local.

### Desplegar en un stage

```bash
cd infra/shared && serverless deploy --stage <stage>          # primero la infraestructura
cd services/<servicio> && serverless deploy --stage <stage>   # después cada servicio
```

### Despliegue canario (postulaciones)

```bash
bash scripts/canario/canario-servicio.sh <stage>         # una vez: alias live y ruta GET /oportunidades
bash scripts/canario/canario-pesos.sh <stage> canary 10  # 10 % a la versión nueva
bash scripts/canario/canario-pesos.sh <stage> promover   # o: revertir
```

Procedimiento, umbrales y resultados medidos en [`docs/canario.md`](docs/canario.md).

### Frontend

```bash
cd frontend && npm install && npm run dev   # http://localhost:3000
```

Necesita `frontend/.env.local` con `NEXT_PUBLIC_API_URL` y los datos de Cognito del stage (no se sube al repositorio).

## Flujo de trabajo

Git Flow simple: `feature/<ID>` → `develop` → `main`, con merge `--no-ff`, Conventional Commits y releases con tag
(`v0.2`, `v0.3`, `v0.4-c3`…). Las decisiones y sus alternativas están en [`docs/decisiones.md`](docs/decisiones.md).

## Estado (Certamen 3)

| Hecho | Pendiente (fase 2) |
|---|---|
| 4 servicios desplegados en demo y conectados al frontend | Servicios notificaciones, mensajes y carga masiva |
| Login con Cognito y grupos | Observabilidad: métricas, dashboard y alarmas |
| Eventos en SQS con DLQ | Consumidor de eventos (notificaciones) |
| Despliegue canario medido y documentado | Workflow de despliegue y experimentos de caos |
| CI con GitHub Actions y 93 pruebas unitarias | Estudio de costos y diseño de seguridad |
