# Prueba de carga y autoescalado (F2-14)

Responsable: José (Rol 1). Fecha: 22-11-2026. Stage: `rol1` (nunca `demo`).

## Método

- **Ruta:** `GET /oportunidades` con el token de `estudiante@ceibbo.cl`. Es la ruta del canario: pasa por el alias `live` de `ceibbo-postulaciones-rol1-postulaciones`.
- **Herramienta:** un generador de carga en Node.js que mantiene N peticiones simultáneas durante 60 segundos por nivel y mide estado y latencia de cada respuesta (lado cliente).
- **Niveles:** 10, 25 y 50 peticiones simultáneas, con una pausa entre niveles para separar los minutos en CloudWatch.
- **Métricas de AWS:** CloudWatch, periodo de 60 segundos, en la ventana de cada nivel. La p95 de CloudWatch es la mayor de las p95 por minuto.

## Límites que aplican

| Límite | Valor | Fuente |
|---|---|---|
| Concurrencia de Lambda de la cuenta | 400 (sin reservar: 400) | `aws lambda get-account-settings` |
| Throttling del stage del HTTP API | 50 solicitudes por segundo, ráfaga de 100 | `infra/shared/serverless.yml:121-123` (F2-15a) |
| Throttling de la cuenta en API Gateway | 10.000 por segundo, ráfaga de 5.000 | Documentación de AWS |

## Resultados

| Concurrencia del cliente | Peticiones | Peticiones/s | 2xx | 429 | Errores (5xx o red) | p50 cliente (ms) | p95 cliente (ms) | Lambda: concurrencia máx. | Lambda: throttles | Lambda: duración prom. / p95 (ms) | API: latencia p95 (ms) | DynamoDB: RCU consumidas |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 2.512 | 41,8 | 2.512 | 0 | 0 | 206 | 409 | 10 | 0 | 14,1 / 421,5 | 1.085,8 | 0,0 |
| 25 | 6.197 | 103,0 | 3.039 | 3.158 | 0 | 206 | 409 | 16 | 0 | 14,4 / 33,7 | 43,6 | 0,0 |
| 50 | 12.561 | 206,3 | 3.087 | 9.474 | 0 | 205 | 405 | 17 | 0 | 13,0 / 35,7 | 33,1 | 0,0 |

"s/d": CloudWatch no entregó datos para esa métrica en la ventana.

## Lectura de los datos

- **Lambda escaló sola:** la concurrencia máxima de la función pasó de 10 a 17 instancias al subir la carga, sin ninguna configuración de escalado.
- **Nivel 25:** API Gateway respondió 3.158 veces 429. Es el throttling del stage (50 solicitudes por segundo, ráfaga de 100; F2-15a): esas peticiones no llegaron a la Lambda.
- **Nivel 50:** API Gateway respondió 9.474 veces 429. Es el throttling del stage (50 solicitudes por segundo, ráfaga de 100; F2-15a): esas peticiones no llegaron a la Lambda.
- **Sin errores ni throttles de Lambda** en ningún nivel.
- **DynamoDB (modo bajo demanda)** no registró lecturas limitadas: las unidades consumidas crecen con el tráfico sin reservar capacidad.

## Cómo escala cada componente

- **Lambda:** crea instancias nuevas a medida que llegan peticiones simultáneas; cada instancia atiende una petición a la vez. El techo es la cuota de concurrencia de la cuenta.
- **API Gateway (HTTP API):** servicio administrado, sin servidores que dimensionar. Lo que lo limita es el throttling: el del stage (F2-15a) y el de la cuenta.
- **DynamoDB:** la tabla está en modo bajo demanda (`PAY_PER_REQUEST`), así que no se reserva capacidad: se cobra y se escala por solicitud.
- **SQS:** no participa en esta ruta. La cola recibe eventos solo al postular.

## Limitaciones

- Niveles cortos (60 s) en una cuenta de AWS Academy y con una sola ruta de lectura.
- Incluye arranques en frío de Lambda.
- La latencia del cliente incluye la red desde el computador que generó la carga.

## Fuentes

- Escalado de Lambda: https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html
- Throttling del HTTP API: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-throttling.html
- Modo bajo demanda de DynamoDB: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/on-demand-capacity-mode.html
