#!/usr/bin/env bash
# Mueve el tráfico del alias "live" de postulaciones entre la versión estable y la candidata.
# Es la versión bash de deploy.ps1, promote.ps1 y rollback.ps1 (F2-12, paso 3).
# Antes hay que correr una vez: canario-servicio.sh <stage>  (crea alias, integración, ruta y permiso).
#
# Uso: canario-pesos.sh <stage> estado
#      canario-pesos.sh <stage> canary <porcentaje>   (publica la versión nueva y le manda ese %)
#      canario-pesos.sh <stage> promover              (la candidata pasa a ser la estable, 100 %)
#      canario-pesos.sh <stage> revertir              (rollback: 100 % a la estable)
set -euo pipefail

stage="${1:?Uso: $0 <stage> <estado|canary N|promover|revertir>}"
accion="${2:?Falta la acción: estado, canary N, promover o revertir}"
region="${AWS_REGION:-us-east-1}"
funcion="ceibbo-postulaciones-${stage}-postulaciones"
alias_live="live"

# Versión a la que apunta el alias (la estable).
estable() {
  aws lambda get-alias --function-name "$funcion" --name "$alias_live" --region "$region" \
    --query FunctionVersion --output text
}

# Versión candidata y su peso, por ejemplo "5 0.1". Vacío si no hay canario activo.
candidata() {
  aws lambda get-alias --function-name "$funcion" --name "$alias_live" --region "$region" \
    --query 'RoutingConfig.AdditionalVersionWeights' --output json \
  | node -e 'const p = JSON.parse(require("fs").readFileSync(0, "utf8")) || {};
             const [v, w] = Object.entries(p)[0] ?? []; console.log(v ? `${v} ${w}` : "")'
}

# Cambia el alias: a qué versión apunta y cuánto tráfico manda a otra.
mover() {
  aws lambda update-alias --function-name "$funcion" --name "$alias_live" --region "$region" \
    --function-version "$1" --routing-config "AdditionalVersionWeights={$2}" >/dev/null
}

case "$accion" in
  estado)
    read -r v_cand peso <<<"$(candidata)" || true
    if [[ -n "${v_cand:-}" ]]; then
      echo "Estable: v$(estable)  ·  Candidata: v$v_cand con $(node -p "Math.round($peso * 100)") % del tráfico"
    else
      echo "Estable: v$(estable) con el 100 % del tráfico (sin canario activo)"
    fi
    ;;
  canary)
    porcentaje="${3:?Falta el porcentaje, por ejemplo: canary 10}"
    [[ "$porcentaje" =~ ^[0-9]+$ ]] && (( porcentaje >= 1 && porcentaje <= 50 )) \
      || { echo "El porcentaje debe ser un entero entre 1 y 50." >&2; exit 2; }
    v_estable=$(estable)
    # publish-version no crea una versión nueva si el código no cambió: devuelve la última.
    v_nueva=$(aws lambda publish-version --function-name "$funcion" --region "$region" \
      --description "Candidata canario ${stage}" --query Version --output text)
    if [[ "$v_nueva" == "$v_estable" ]]; then
      echo "La versión publicada (v$v_nueva) es la misma que la estable: despliega primero el cambio." >&2
      exit 1
    fi
    peso=$(node -p "($porcentaje / 100).toFixed(2)")
    mover "$v_estable" "$v_nueva=$peso"
    echo "Canario activo: $porcentaje % a v$v_nueva y el resto a v$v_estable."
    ;;
  promover)
    read -r v_cand _ <<<"$(candidata)" || true
    [[ -n "${v_cand:-}" ]] || { echo "No hay canario activo que promover." >&2; exit 1; }
    mover "$v_cand" ""
    echo "Promovida: el alias $alias_live apunta 100 % a v$v_cand."
    ;;
  revertir)
    v_estable=$(estable)
    mover "$v_estable" ""
    echo "Rollback: el alias $alias_live vuelve 100 % a v$v_estable."
    ;;
  *)
    echo "Acción desconocida: $accion (usa estado, canary N, promover o revertir)" >&2
    exit 2
    ;;
esac