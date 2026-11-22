# Plantilla de experimentos de caos

Esta plantilla define cómo diseñar, ejecutar y documentar experimentos de caos en los servicios serverless de Ceibbo. Los experimentos se ejecutan únicamente en stages de prueba (`rol1`, `rol2` o `rol3`). No se ejecutan en `demo` ni en producción.

La guía principal usa [`failure-lambda`](https://github.com/gunnargrosch/failure-lambda), compatible con Node.js 20 o superior. Ceibbo usa Node.js 22.

## 1. Plantilla reutilizable

| Campo | Contenido que se debe completar |
|---|---|
| ID | Identificador único, por ejemplo `CHAOS-HAB-01`. |
| Responsable | Persona que ejecuta y detiene el experimento. |
| Servicio y stage | Lambda, endpoint y stage afectados. |
| Estado estable | Comportamiento normal medido antes del experimento. |
| Hipótesis | Resultado esperado mientras la falla está activa y después de retirarla. |
| Falla | Latencia, excepción, timeout, código HTTP, corrupción o dependencia bloqueada. |
| Alcance | Porcentaje de invocaciones, rutas y usuarios afectados. |
| Duración | Tiempo máximo durante el cual puede permanecer activa la falla. |
| Métricas | Latencia, errores 5xx, invocaciones, logs, throttles y datos del dominio. |
| Criterio de aprobación | Umbral objetivo que determina si la hipótesis se cumplió. |
| Criterio de aborto | Condición que obliga a detener inmediatamente el experimento. |
| Recuperación | Procedimiento para desactivar la falla y comprobar el estado estable. |
| Evidencia | Configuración, comandos, capturas, consultas de logs y conclusión. |

## 2. Preparación con `failure-lambda`

### 2.1 Instalar y envolver el handler

Desde el servicio que será probado:

```bash
npm install failure-lambda@1
```

El handler real se conserva y luego se exporta envuelto. Ejemplo conceptual para `habilidades`:

```js
import failureLambda from 'failure-lambda'

async function handlerBase(event) {
  // Lógica actual del handler.
}

export const handler = failureLambda(handlerBase)
```

En `serverless.yml`, la función debe conocer el nombre del parámetro de SSM:

```yaml
provider:
  environment:
    FAILURE_INJECTION_PARAM: /ceibbo/${sls:stage}/failure-lambda
    FAILURE_CACHE_TTL: '10'
```

`FAILURE_CACHE_TTL=10` reduce a diez segundos el tiempo necesario para observar cambios durante el experimento. Después de las pruebas se puede restaurar el valor predeterminado.

> En AWS Academy se usa `LabRole`. Antes de ejecutar, se debe comprobar que permite `ssm:GetParameter`. En una cuenta normal se debe conceder únicamente lectura sobre el parámetro del stage correspondiente.

### 2.2 Crear la configuración desactivada

La configuración inicial no inyecta ninguna falla:

```bash
aws ssm put-parameter \
  --region us-east-1 \
  --name /ceibbo/rol2/failure-lambda \
  --type String \
  --overwrite \
  --value '{
    "latency":{"enabled":false},
    "exception":{"enabled":false},
    "statuscode":{"enabled":false},
    "timeout":{"enabled":false},
    "corruption":{"enabled":false},
    "diskspace":{"enabled":false},
    "denylist":{"enabled":false}
  }'
```

Comprobar el estado:

```bash
npx failure-lambda status \
  --param /ceibbo/rol2/failure-lambda \
  --region us-east-1
```

### 2.3 Activar y desactivar una falla

La CLI puede habilitar una falla de forma interactiva:

```bash
npx failure-lambda enable latency \
  --param /ceibbo/rol2/failure-lambda \
  --region us-east-1
```

El kill switch operativo es desactivar todas las fallas:

```bash
npx failure-lambda disable --all \
  --param /ceibbo/rol2/failure-lambda \
  --region us-east-1
```

Como segundo kill switch, la integración mediante paquete permite definir:

```text
FAILURE_LAMBDA_DISABLED=true
```

## 3. Experimento preparado: latencia en habilidades

| Campo | Definición |
|---|---|
| ID | `CHAOS-HAB-01` |
| Responsable | Ian |
| Servicio | `ceibbo-habilidades` |
| Stage | `rol2` |
| Rutas | `POST /habilidades`, `GET /habilidades/me`, `GET /habilidades/pendientes` y `PATCH /habilidades/{estudianteId}/{habilidadId}` |
| Estado estable | Las rutas válidas responden sin errores inesperados y con p95 inferior a 1.500 ms. |
| Hipótesis | Al agregar entre 2 y 4 segundos de latencia al 20 % de las invocaciones, el servicio permanece dentro del timeout de 15 segundos, registra el aumento de latencia y no duplica ni corrompe habilidades. Al retirar la falla, p95 vuelve al umbral estable. |
| Falla | Latencia artificial entre 2.000 y 4.000 ms. |
| Alcance | 20 % de las invocaciones durante cinco minutos. |
| Métricas | `Duration`, `Errors`, p95, respuestas 5xx y logs de `failure-lambda`. |
| Aprobación | Sin pérdida ni duplicación de datos; tasa de 5xx menor al 1 %; recuperación en menos de dos minutos después de desactivar la falla. |
| Aborto | Errores mayores al 10 %, respuesta cercana al timeout o indicios de corrupción/duplicación. |
| Recuperación | Desactivar todas las fallas, esperar el TTL de caché, repetir las rutas y verificar los datos. |

Configuración SSM equivalente:

```json
{
  "latency": {
    "enabled": true,
    "percentage": 20,
    "min_latency": 2000,
    "max_latency": 4000
  },
  "exception": { "enabled": false },
  "statuscode": { "enabled": false },
  "timeout": { "enabled": false },
  "corruption": { "enabled": false },
  "diskspace": { "enabled": false },
  "denylist": { "enabled": false }
}
```

### Secuencia de ejecución

1. Confirmar que el stage es `rol2` y que no hay una demostración en curso.
2. Ejecutar las rutas de habilidades sin fallas y guardar latencia, estado HTTP y logs.
3. Activar la configuración de latencia.
4. Generar tráfico durante cinco minutos con el mismo conjunto de solicitudes.
5. Observar métricas y verificar que no se superen los criterios de aborto.
6. Ejecutar `disable --all`.
7. Esperar al menos el TTL de caché configurado.
8. Repetir las pruebas funcionales y comprobar que los datos son correctos.
9. Registrar el resultado como `APROBADO`, `RECHAZADO` o `ABORTADO`.

Consulta sugerida en CloudWatch Logs Insights:

```text
fields @timestamp, source, mode, action, latency_ms, @message
| filter source = "failure-lambda"
| sort @timestamp desc
| limit 100
```

## 4. Alternativa por variable de entorno

Esta alternativa se usa solo si `failure-lambda`, SSM o la Lambda Layer no están disponibles en AWS Academy.

Variables propuestas:

```text
CHAOS_ENABLED=true
CHAOS_MODE=latency
CHAOS_PERCENTAGE=20
CHAOS_LATENCY_MS=3000
CHAOS_ALLOWED_STAGE=rol2
```

Reglas obligatorias:

- La inyección debe permanecer desactivada por defecto.
- El código debe rechazarla cuando el stage no coincide con `CHAOS_ALLOWED_STAGE`.
- `demo` y producción deben estar bloqueados explícitamente.
- No se deben guardar tokens, contraseñas ni cuerpos privados en logs.
- Debe existir un kill switch: `CHAOS_ENABLED=false`.
- La falla debe ejecutarse antes de la lógica de negocio para evitar escrituras parciales.
- El porcentaje debe limitarse y registrarse en cada invocación afectada.

## 5. Registro de resultados

| Dato | Resultado |
|---|---|
| Fecha y hora | Por completar |
| Stage | `rol2` |
| Versión desplegada | Por completar |
| Duración real | Por completar |
| Solicitudes totales | Por completar |
| Solicitudes afectadas | Por completar |
| p95 antes/durante/después | Por completar |
| Errores antes/durante/después | Por completar |
| Datos duplicados o corruptos | Sí / No |
| Resultado | Aprobado / Rechazado / Abortado |
| Aprendizajes y acciones | Por completar |

