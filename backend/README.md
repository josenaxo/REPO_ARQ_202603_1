# backend/ · monolito anterior (solo referencia)

Esta carpeta es el backend original de Ceibbo: NestJS con PostgreSQL y TypeORM.
**Ya no se usa ni se despliega.** Se conserva para comparar y como punto de partida de la migración.

- El estado del monolito al iniciar la migración está marcado con el tag `v0.0-monolito`.
- El backend actual son los microservicios de [`../services`](../services), desplegados con Serverless en AWS
  (ver el [README principal](../README.md) y [`../docs/patrones.md`](../docs/patrones.md)).
- La migración sigue el patrón Strangler Fig: cada dominio se reemplaza por un servicio y el frontend cambia
  sus llamadas ruta por ruta.
