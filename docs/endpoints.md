# Endpoints de Ceibbo

Base en demo: `https://swf77ilyni.execute-api.us-east-1.amazonaws.com` (un solo HTTP API compartido, creado en `infra/shared`).
Todas las rutas, salvo `GET /health`, pasan por el autorizador JWT de Cognito: sin token responden `401` antes de invocar la Lambda.
Contratos completos en `contracts/api/*.yaml`. Colección para ejecutarlas: `docs/postman/Ceibbo.postman_collection.json`.

| # | Servicio (rol) | Método y ruta | Grupo | Respuestas | Qué hace |
|---|---|---|---|---|---|
| 1 | health (Rol 1) | `GET /health` | público | 200 | Estado del servicio y de DynamoDB |
| 2 | health (Rol 1) | `GET /health/privado` | cualquiera con token | 200, 401 | Igual, pero comprueba el autorizador JWT |
| 3 | perfiles (Rol 3) | `POST /perfiles` | sin grupo (registro) | 201, 400, 403, 409 | Crea el perfil de estudiante y lo agrega al grupo `estudiante` |
| 4 | perfiles (Rol 3) | `GET /perfiles/me` | todos | 200, 404 | Perfil del usuario del token |
| 5 | perfiles (Rol 3) | `PUT /perfiles/me` | todos | 200, 400, 404 | Edita los campos permitidos según el tipo |
| 6 | perfiles (Rol 3) | `GET /colegios` | todos | 200 | Lista de colegios para el selector |
| 7 | perfiles (Rol 3) | `GET /colegios/{id}/config` | todos | 200, 404 | Personalización del colegio (color, logo, especialidades) |
| 8 | perfiles (Rol 3) | `PUT /colegios/{id}/config` | colegio dueño | 200, 400, 403 | Edita la personalización del colegio |
| 9 | perfiles (Rol 3) | `GET /colegios/{id}/estudiantes` | colegio dueño | 200, 403 | Estudiantes del colegio con total y promedio |
| 10 | habilidades (Rol 2) | `POST /habilidades` | estudiante | 201, 400, 409 | Declara una habilidad |
| 11 | habilidades (Rol 2) | `GET /habilidades/me` | estudiante | 200 | Habilidades propias |
| 12 | habilidades (Rol 2) | `GET /habilidades/pendientes` | colegio | 200 | Habilidades por validar de sus estudiantes |
| 13 | habilidades (Rol 2) | `PATCH /habilidades/{estudianteId}/{habilidadId}` | colegio dueño | 200, 403, 404, 409 | Valida o rechaza; publica `HabilidadValidada` en SQS |
| 14 | postulaciones (Rol 1) | `POST /oportunidades` | empresa | 201, 400, 403 | Publica una oferta |
| 15 | postulaciones (Rol 1) | `GET /oportunidades` **(canario)** | todos | 200, 400 | Ofertas activas; filtros `?tipo=` y `?remoto=`. Apunta al alias `live` (D-03) |
| 16 | postulaciones (Rol 1) | `GET /oportunidades/mias` | empresa | 200, 403 | Ofertas de la empresa |
| 17 | postulaciones (Rol 1) | `POST /oportunidades/{id}/postulaciones` | estudiante | 201, 403, 404, 409 | Postula (idempotente); publica `PostulacionCreada` en SQS |
| 18 | postulaciones (Rol 1) | `GET /oportunidades/{id}/postulaciones` | empresa dueña | 200, 403, 404 | Postulantes de una oferta propia |
| 19 | postulaciones (Rol 1) | `GET /postulaciones/mias` | estudiante | 200, 403 | Postulaciones propias |
| 20 | notificaciones (Rol 3) | `GET /notifications` | todos | 200, 403 | Notificaciones propias, más nuevas primero |
| 21 | notificaciones (Rol 3) | `PATCH /notifications/read-all` | todos | 200, 403 | Marca todas las propias como leídas |
| 22 | notificaciones (Rol 3) | `PATCH /notifications/{id}/read` | dueño | 200, 403, 404 | Marca una como leída |
| 23 | notificaciones (Rol 3) | `DELETE /notifications/{id}` | dueño | 204, 403, 404 | Borra una |

Las notificaciones las crea el consumidor de la cola de eventos (función `consumidor` de notificaciones) a partir de `PostulacionCreada` y `HabilidadValidada`. Las rutas usan nombres en inglés porque son las que ya llamaban las pantallas.

Todas las respuestas de `postulaciones` traen la cabecera `X-App-Version` con la versión de la Lambda que respondió.

## Probar con curl

```bash
export CEIBBO_TEST_PASSWORD='<contraseña de prueba>'
API=https://swf77ilyni.execute-api.us-east-1.amazonaws.com
TOKEN=$(bash scripts/aws/token.sh demo estudiante@ceibbo.cl)
curl -s $API/health
curl -s -i "$API/oportunidades?tipo=PRACTICA" -H "Authorization: Bearer $TOKEN"
```

## Probar con Postman

1. Importar `docs/postman/Ceibbo.postman_collection.json`.
2. En Variables de la colección, escribir la contraseña de prueba en el *Current value* de `password` (no se sube al repositorio).
3. Ejecutar la carpeta **0 · Login** y después las demás en orden (Run collection). Cada request tiene tests de código HTTP.
