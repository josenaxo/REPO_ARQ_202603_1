# Despliegue canario - Unidad II

El canario usa versiones publicadas de la función `postulaciones` y el alias ponderado
`live`. La ruta `GET /oportunidades` del HTTP API apunta al ARN del alias y conserva el
autorizador JWT de Cognito. Las respuestas incluyen `X-App-Version`, lo que permite
separar las mediciones de la versión estable y la candidata.

## Preparación del stage

Desplegar primero la infraestructura y el servicio desde la rama correspondiente:

```powershell
cd infra/shared
npx serverless deploy --stage rol2
cd ../../services/postulaciones
npm ci
npx serverless deploy --stage rol2
cd ../..
```

Crear el alias `live`, su integración, la ruta protegida y el permiso de invocación:

```powershell
& "C:\Program Files\Git\bin\bash.exe" scripts/canario/canario-servicio.sh rol2
```

El script es idempotente. Si el alias ya existe, conserva su versión estable y repara
la integración y la ruta sin cambiar los pesos del canario.

## Usuario y token de prueba

```powershell
$env:CEIBBO_TEST_PASSWORD = "<password-temporal>"
& "C:\Program Files\Git\bin\bash.exe" scripts/aws/crear-usuarios-prueba.sh rol2
$env:TOKEN = (& "C:\Program Files\Git\bin\bash.exe" scripts/aws/token.sh rol2 estudiante@ceibbo.cl).Trim()

$api = aws cloudformation describe-stacks `
  --stack-name ceibbo-shared-rol2 `
  --query "Stacks[0].Outputs[?OutputKey=='HttpApiUrl'].OutputValue | [0]" `
  --output text
$env:URL = "$api/oportunidades"
```

Sin `TOKEN`, o con uno inválido, la API debe responder `401` y la Lambda no debe ser
invocada.

## Activar y medir el canario

El primer uso de `canario-servicio.sh` crea la versión estable. Después de desplegar
una modificación candidata, publicar la nueva versión y enviarle 10 % del tráfico:

```powershell
.\scripts\canario\deploy.ps1 `
  -FunctionName ceibbo-postulaciones-rol2-postulaciones `
  -Alias live `
  -Weight 0.10

$env:TOTAL = "100"
$env:CONCURRENCIA = "10"
node scripts/canario/generar_carga.js
```

La salida agrupa los estados HTTP y las respuestas por `X-App-Version`, e informa el
porcentaje de errores y el p95 observado.

Si la candidata cumple los umbrales:

```powershell
.\scripts\canario\promote.ps1 `
  -FunctionName ceibbo-postulaciones-rol2-postulaciones `
  -Alias live
```

Si la candidata empeora:

```powershell
.\scripts\canario\rollback.ps1 `
  -FunctionName ceibbo-postulaciones-rol2-postulaciones `
  -Alias live
```

## Criterios de decisión

- Duración mínima: 10 minutos y al menos 100 invocaciones.
- Promover si los errores son menores a 1 % y el p95 no aumenta más de 20 %.
- Revertir si los errores son al menos 1 %, el p95 aumenta más de 20 % o aparecen
  fallos funcionales.

Registrar fecha, versiones, invocaciones, tasa de error, p95 y decisión. La
automatización de alarmas y CI/CD corresponde a la Unidad III.


## Uso desde Linux o macOS (bash)

`scripts/canario/canario-pesos.sh` hace lo mismo que `deploy.ps1`, `promote.ps1` y `rollback.ps1`:

```bash
bash scripts/canario/canario-servicio.sh <stage>          # una vez: alias live, integración, ruta JWT y permiso
bash scripts/canario/canario-pesos.sh <stage> estado
bash scripts/canario/canario-pesos.sh <stage> canary 10   # publica la versión nueva y le manda 10 %
bash scripts/canario/canario-pesos.sh <stage> canary 50   # sube la misma candidata a 50 %
bash scripts/canario/canario-pesos.sh <stage> promover    # la candidata pasa a ser la estable
bash scripts/canario/canario-pesos.sh <stage> revertir    # rollback: 100 % a la estable
```

`generar_carga.js` muestra también `porVersion`: errores y p95 de cada versión por separado.

## Resultados · 27 de octubre de 2026 · stage rol1

**Cambio liberado:** filtro opcional `GET /oportunidades?tipo=` (v3). La estable es la v2, sin filtro.
**Carga:** `generar_carga.js` con token de estudiante y concurrencia 10.

| Escenario | v2 (estable) | v3 (candidata) | Global | Decisión |
|---|---|---|---|---|
| 0 · Línea base, solo v2 | 200 req · 0 % · p95 2159 ms | — | 0 % · p95 2159 ms | Referencia |
| 1 · Canario 10 % | 271 req · 0 % · p95 1289 ms | 29 req · 0 % · p95 1240 ms | 0 % · p95 1281 ms | Cumple: subir a 50 % |
| 2 · Canario 50 % | 146 req · 0 % · p95 983 ms | 154 req · 0 % · p95 1114 ms (+13 %) | 0 % · p95 1033 ms | Cumple: promover |
| 3 · Promovida | — | 100 req · 0 % | 0 % | v3 es la estable |

**Comprobación funcional al 50 %:** 10 llamadas a `?tipo=PRACTICA`. La v3 respondió 5 veces con 1 oferta (filtra) y la v2 respondió 5 veces con 2 ofertas (ignora el filtro).

**Decisión:** promover. Errores 0 % (< 1 %) y p95 de la candidata a no más de 13 % de la estable (< 20 %).

**Limitaciones:** cada etapa duró cerca de 1 minuto, no los 10 que fija el criterio, aunque superó las 100 invocaciones. La latencia está dominada por la red desde Chile hasta us-east-1 y varía entre corridas (la línea base dio 1292 ms y 2159 ms en dos mediciones). Por eso la comparación válida es entre versiones dentro de la misma corrida, no contra la línea base.

## Respuestas a las preguntas de análisis de la guía

1. **Usuarios afectados con el 10 %.** 29 de 300 solicitudes (9,7 %) llegaron a la v3. Si la v3 hubiera fallado, el impacto habría quedado en cerca del 10 % de los usuarios. Con un despliegue estándar habría sido el 100 %.
2. **Por qué la tasa global es menor que la de la candidata.** La global mezcla las dos versiones según su peso: global ≈ peso × error de v3 + (1 − peso) × error de v2. Una v3 con 30 % de errores al 10 % se vería como un 3 % global. Por eso se mide `porVersion`.
3. **Por qué el endpoint no cambió.** API Gateway apunta al alias `live`, no a una versión. Es el alias el que reparte el tráfico, así que el cliente siempre usa la misma URL.
4. **Por qué por etapas (10 → 50 → 100).** Con el 10 % la candidata recibió solo 29 solicitudes, muy pocas para concluir. Al 50 % hay más datos y más concurrencia, y aparecen problemas que solo se ven con carga (arranques en frío, límites). El radio de impacto crece de a poco.
5. **Ventaja del rollback por peso.** Es inmediato: la versión estable ya está publicada, es inmutable y está caliente. No hay que volver a compilar ni desplegar. Nos pasó durante esta prueba: `serverless deploy` falló por un timeout de red, así que un rollback que dependiera de volver a desplegar habría quedado bloqueado.
6. **Métrica adicional.** De negocio: porcentaje de búsquedas que devuelven ofertas, o postulaciones creadas por hora. Técnica: la tasa de 4xx por versión, porque un filtro nuevo mal usado se vería como un aumento de 400 aunque no haya 5xx.