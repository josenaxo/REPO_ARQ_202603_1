# infra/frontend

Frontend de Ceibbo publicado como sitio estático: export de Next.js en un bucket S3 con
sitio web, servido por **CloudFront** con HTTPS. El stack se llama `ceibbo-frontend-<stage>`
y está en `frontend.yml`.

## Despliegue

Desde la raíz del repo, con credenciales vigentes del Learner Lab:

```bash
STAGE=rol1
# 1. Bucket + CloudFront
aws cloudformation deploy --stack-name ceibbo-frontend-$STAGE --template-file infra/frontend/frontend.yml

# 2. Build estático (API y Cognito salen de los outputs de ceibbo-shared-$STAGE)
cd frontend
NEXT_OUTPUT=export \
NEXT_PUBLIC_API_URL=<HttpApiUrl> \
NEXT_PUBLIC_USER_POOL_ID=<UserPoolId> \
NEXT_PUBLIC_USER_POOL_CLIENT_ID=<UserPoolClientId> \
npm run build            # genera frontend/out/

# 3. Subir e invalidar la caché
aws s3 sync out s3://<BucketName> --delete
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths '/*'
```

La URL del frontend (`FrontendUrl`) debe estar en `AllowOrigins` del CORS del HTTP API
(`infra/shared/serverless.yml`).

## Decisiones y limitaciones

- **Export estático, sin servidor:** las pantallas son componentes de cliente que llaman al HTTP API,
  así que no hace falta un servidor de Next.js. S3 y CloudFront cobran por uso.
- **`NEXT_OUTPUT=export`:** el modo estático solo se activa en este build; `npm run dev` no cambia.
- **Origen de sitio web de S3 y bucket de lectura pública:** el diseño ideal es un bucket privado con
  Origin Access Control y una CloudFront Function para las rutas, pero el Learner Lab niega
  `cloudfront:CreateOriginAccessControl` y `cloudfront:CreateFunction`. El bucket solo contiene
  archivos públicos del sitio (sin datos ni secretos). Si el lab no permite crear la distribución,
  el parámetro `ConCloudFront=false` publica solo con el sitio web de S3 (HTTP).
- **Ruta dinámica `/student/ver/[userId]`:** el export genera una sola página (`_`). Sin CloudFront
  Functions no se pueden reescribir los ids, así que esa pantalla (perfil social heredado del
  monolito) no funciona en el sitio estático.
