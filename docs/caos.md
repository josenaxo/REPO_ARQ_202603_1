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


## 6. Experimento ejecutado: latencia en postulaciones (CHAOS-POS-01)

| Campo | Definición |
|---|---|
| ID | `CHAOS-POS-01` |
| Responsable | José (Rol 1) |
| Servicio y stage | `ceibbo-postulaciones-rol1-postulaciones` en `rol1` |
| Ruta medida | `GET /postulaciones/mias` (estudiante). Va a `$LATEST`, no al alias `live` del canario |
| Estado estable | Medido antes de la falla: p95 406 ms y 0,00 % de errores |
| Hipótesis | Con 2 s de latencia en el 20 % de las invocaciones, el servicio sigue respondiendo sin errores (timeout de 10 s), la p95 sube a cerca de 2 s y, al apagar la falla, vuelve al estado estable |
| Falla | Latencia fija de 2.000 ms |
| Alcance | 20 % de las invocaciones de la función, 182 s, solo en `rol1` |
| Mecanismo | failure-lambda con su configuración en SSM (`/ceibbo/rol1/failure-lambda`) |
| Métricas | Estado y latencia de cada respuesta (cliente), inyecciones en CloudWatch Logs y alarma `ceibbo-rol1-api-5xx` |
| Criterio de aprobación | Errores menores al 1 % durante la falla; p95 de recuperación de hasta 1,2 veces la estable (el mismo umbral del canario); sin cambios en los datos |
| Criterio de aborto | Errores mayores al 10 % o la alarma de 5xx en ALARM |
| Recuperación | Apagar la falla, esperar el TTL de caché (10 s), medir de nuevo y volver a desplegar en `rol1` el código de `develop` |

| Dato | Resultado |
|---|---|
| Fecha y hora | 22-11-2026 19:00 |
| Stage | `rol1` |
| Versión desplegada | Rama `caos/F2-13a` (no integrada en `develop`) |
| Duración real | Estable 120 s · falla 182 s · recuperación 120 s |
| Solicitudes totales | 2.567 · 1.356 · 2.479 |
| Solicitudes afectadas | 0 inyecciones registradas; 283 respuestas de 1.800 ms o más |
| p95 antes/durante/después | 406 / 2.254 / 404 ms |
| Errores antes/durante/después | 0,00 % / 0,00 % / 0,00 % |
| Datos duplicados o corruptos | No: el estudiante tenía 2 postulaciones antes y después (la ruta solo lee) |
| Alarma `ceibbo-rol1-api-5xx` | No pasó a ALARM (estado final: OK) |
| Resultado | **NO CONCLUYENTE**: no se registraron inyecciones de latencia en los logs |

Aprendizajes y acciones:

- Se registraron 0 inyecciones de latencia en los logs, para 1.356 peticiones (con el 20 % se esperaban unas 271).
- La p95 pasó de 406 ms a 2.254 ms con la falla activa y volvió a 404 ms al apagarla.
- La alarma de 5xx no se activó: la latencia no produce errores mientras quede bajo el timeout de 10 s. Para detectar este tipo de falla hace falta una alarma de latencia (p95), que hoy no existe.
- `failure-lambda` leyó su configuración desde SSM con LabRole: no fue necesario el plan B.
