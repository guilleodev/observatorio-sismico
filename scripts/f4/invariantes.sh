#!/usr/bin/env bash
# Invariantes de F3 y huellas del historico (F4). SOLO LECTURA. Uso: scripts/f4/invariantes.sh [etiqueta]
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
export MSYS_NO_PATHCONV=1
q() { docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" 2>/dev/null | tr -d '\r'; }
lag=$(docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group consumidor-live 2>/dev/null | awk '$1=="consumidor-live"{print $4"/"$5"/"$6; exit}')
echo "== invariantes [${1:-}] $(date -u +%FT%TZ) =="
echo "F3: reconciliacion=$(q "SELECT count(*) FROM live.version_publicada p WHERE NOT EXISTS (SELECT 1 FROM live.evento_version v WHERE v.event_id=p.event_id AND v.updated_at=to_timestamp(p.updated_ms/1000.0)) AND NOT EXISTS (SELECT 1 FROM live.cuarentena c WHERE c.event_id=p.event_id AND c.updated_ms=p.updated_ms)") | offsets duplicados=$(q "SELECT count(*) FROM (SELECT kafka_offset FROM live.evento_version GROUP BY kafka_offset HAVING count(*)>1) s") | actual desfasado=$(q "SELECT count(*) FROM live.evento_actual a WHERE NOT a.retirado AND a.updated_at <> (SELECT max(v.updated_at) FROM live.evento_version v WHERE v.event_id=a.event_id)") | publicadas=$(q "SELECT count(*) FROM live.version_publicada") versiones=$(q "SELECT count(*) FROM live.evento_version") cuarentena=$(q "SELECT count(*) FROM live.cuarentena") | offset/final/lag=${lag:-n/d}"
echo "geo: reparto live=$(q "SELECT string_agg(geo_resultado||'='||n, ', ') FROM (SELECT coalesce(geo_resultado,'(sin asignar)') geo_resultado, count(*) n FROM live.evento_actual GROUP BY 1 ORDER BY 1) s") | incoherentes=$(q "SELECT count(*) FROM live.evento_actual WHERE geo_resultado IS NOT NULL AND (country_id IS NULL) <> (geo_resultado='sin_pais')")"
echo "historico: consultas=$(q "SELECT count(*) FROM historico.consulta") ok=$(q "SELECT count(*) FROM historico.consulta WHERE resultado='ok'") eventos=$(q "SELECT count(*) FROM historico.evento") cuarentena=$(q "SELECT count(*) FROM historico.cuarentena") archivos=$(q "SELECT count(*) FROM historico.archivo")"
echo "historico huellas: md5(eventos)=$(q "SELECT md5(string_agg(event_id||updated_at::text||coalesce(country_id,'-'), '|' ORDER BY event_id)) FROM historico.evento") | md5(sha256 de archivos)=$(q "SELECT md5(string_agg(sha256, '|' ORDER BY consulta_id)) FROM historico.archivo") | sha256 recalculado distinto de lo guardado=$(q "SELECT count(*) FROM historico.archivo WHERE encode(sha256(contenido_gz),'hex') <> sha256")"
echo "sintetico: md5=$(q "SELECT md5(string_agg(t::text, '|' ORDER BY t::text)) FROM sintetico.evento_actual t") filas=$(q "SELECT count(*) FROM sintetico.evento_actual")"
if [ -f data/historico/SHA256SUMS ]; then
  malos=$(cd data/historico && sha256sum -c SHA256SUMS 2>&1 | grep -vc ': OK$')
  echo "exportados: $(ls data/historico/*.gz | wc -l) archivos | sha256sum -c: fallos=$malos | md5(SHA256SUMS)=$(md5sum data/historico/SHA256SUMS | cut -d' ' -f1)"
fi
echo "servicios: $(docker compose ps --format '{{.Service}}:{{.Health}}' | sort | tr '\n' ' ')"
