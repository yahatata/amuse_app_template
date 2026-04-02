#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID=""
REGIONS_CSV="us-central1,asia-northeast1"
APPLY=0
WORK_DIR=""
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  scripts/functions_env_inventory_and_cleanup.sh --project <PROJECT_ID> [options]

Options:
  --project <id>          GCP project id (required)
  --regions <csv>         Target regions (default: us-central1,asia-northeast1)
  --apply                 Apply env-var removals to Cloud Run services
  --work-dir <path>       Output working directory (default: /tmp/functions-env-cleanup-<timestamp>)
  -h, --help              Show help

Outputs:
  <work-dir>/fn_env_keys.tsv
  <work-dir>/source_env_keys.unique
  <work-dir>/remove_candidates.keys
  <work-dir>/remove_candidates.by_function.tsv
  <work-dir>/remove_candidates.filtered.keys
  <work-dir>/remove_candidates.filtered.by_function.tsv
  <work-dir>/remove_commands.sh

Notes:
  - "filtered" excludes system/runtime-managed keys:
    EVENTARC_CLOUD_EVENT_SOURCE, FIREBASE_CONFIG, FUNCTION_SIGNATURE_TYPE,
    FUNCTION_TARGET, LOG_EXECUTION_ID, GCLOUD_PROJECT, NODE_ENV
  - With --apply, updates are executed via:
    gcloud run services update <service> --remove-env-vars=...
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --regions)
      REGIONS_CSV="${2:-}"
      shift 2
      ;;
    --apply)
      APPLY=1
      shift
      ;;
    --work-dir)
      WORK_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_ID" ]]; then
  echo "--project is required" >&2
  usage
  exit 1
fi

if [[ -z "$WORK_DIR" ]]; then
  WORK_DIR="/tmp/functions-env-cleanup-$(date +%Y%m%d-%H%M%S)"
fi

mkdir -p "$WORK_DIR"

FN_TSV="$WORK_DIR/fn_env_keys.tsv"
FN_KEYS="$WORK_DIR/fn_env_keys.unique"
SRC_KEYS="$WORK_DIR/source_env_keys.unique"
REMOVE_KEYS="$WORK_DIR/remove_candidates.keys"
REMOVE_BY_FN="$WORK_DIR/remove_candidates.by_function.tsv"
SYSTEM_KEYS="$WORK_DIR/system_managed.keys"
REMOVE_KEYS_FILTERED="$WORK_DIR/remove_candidates.filtered.keys"
REMOVE_BY_FN_FILTERED="$WORK_DIR/remove_candidates.filtered.by_function.tsv"
REMOVE_CMDS="$WORK_DIR/remove_commands.sh"
APPLY_FAILED="$WORK_DIR/apply_failed.tsv"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

need_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found: $cmd" >&2
    exit 1
  fi
}

need_cmd gcloud
need_cmd jq
need_cmd awk
need_cmd sort
need_cmd comm
need_cmd rg

IFS=',' read -r -a REGIONS <<< "$REGIONS_CSV"

log "Working directory: $WORK_DIR"
log "Collecting deployed environment variables..."
: > "$FN_TSV"

for region in "${REGIONS[@]}"; do
  region="$(echo "$region" | xargs)"
  [[ -z "$region" ]] && continue
  log "Listing functions in region: $region"
  gcloud functions list --v2 --regions="$region" --project="$PROJECT_ID" --format='value(name)' \
    | while IFS= read -r fn_path; do
        [[ -z "$fn_path" ]] && continue
        fn="${fn_path##*/}"
        gcloud functions describe "$fn" --v2 --region="$region" --project="$PROJECT_ID" --format='json(serviceConfig.environmentVariables)' \
          | jq -r '.serviceConfig.environmentVariables // {} | keys[]' \
          | awk -v r="$region" -v f="$fn" '{print r "\t" f "\t" $0}' >> "$FN_TSV"
      done
done

LC_ALL=C sort -u "$FN_TSV" -o "$FN_TSV"
cut -f3 "$FN_TSV" | LC_ALL=C sort -u > "$FN_KEYS"

log "Collecting env-key references from source..."
{
  rg -oN "process\\.env\\.([A-Z0-9_]+)" "$REPO_ROOT/functions/src" -g '*.ts' -r '$1' || true
  rg -oN "process\\.env\\[['\"]([A-Z0-9_]+)['\"]\\]" "$REPO_ROOT/functions/src" -g '*.ts' -r '$1' || true
  rg -oN "getEnv\\(['\"]([A-Z0-9_]+)['\"]\\)" "$REPO_ROOT/functions/src" -g '*.ts' -r '$1' || true
  rg -oN "defineString\\(['\"]([A-Z0-9_]+)['\"]\\)" "$REPO_ROOT/functions/src" -g '*.ts' -r '$1' || true
} | LC_ALL=C sort -u > "$SRC_KEYS"

comm -23 "$FN_KEYS" "$SRC_KEYS" > "$REMOVE_KEYS"
awk 'NR==FNR {c[$1]=1; next} c[$3] {print $1 "\t" $2 "\t" $3}' "$REMOVE_KEYS" "$FN_TSV" \
  | LC_ALL=C sort -u > "$REMOVE_BY_FN"

cat > "$SYSTEM_KEYS" <<'EOF'
EVENTARC_CLOUD_EVENT_SOURCE
FIREBASE_CONFIG
FUNCTION_SIGNATURE_TYPE
FUNCTION_TARGET
GCLOUD_PROJECT
LOG_EXECUTION_ID
NODE_ENV
EOF

comm -23 "$REMOVE_KEYS" "$SYSTEM_KEYS" > "$REMOVE_KEYS_FILTERED"
awk 'NR==FNR {c[$1]=1; next} c[$3] {print $1 "\t" $2 "\t" $3}' "$REMOVE_KEYS_FILTERED" "$FN_TSV" \
  | LC_ALL=C sort -u > "$REMOVE_BY_FN_FILTERED"

awk '{k=$1 "\t" $2; if (m[k] == "") m[k] = $3; else m[k] = m[k] "," $3}
     END {for (k in m) print k "\t" m[k]}' "$REMOVE_BY_FN_FILTERED" \
  | LC_ALL=C sort -u \
  | awk -F'\t' '{print "gcloud run services update " tolower($2) " --region=" $1 " --project='"$PROJECT_ID"' --remove-env-vars=" $3 " --quiet"}' > "$REMOVE_CMDS"

chmod +x "$REMOVE_CMDS"

log "Inventory completed."
log "raw_candidate_keys=$(wc -l < "$REMOVE_KEYS" | tr -d ' ')"
log "raw_candidate_rows=$(wc -l < "$REMOVE_BY_FN" | tr -d ' ')"
log "filtered_candidate_keys=$(wc -l < "$REMOVE_KEYS_FILTERED" | tr -d ' ')"
log "filtered_candidate_rows=$(wc -l < "$REMOVE_BY_FN_FILTERED" | tr -d ' ')"
log "Preview of filtered keys:"
cat "$REMOVE_KEYS_FILTERED"
echo
log "Generated removal commands: $REMOVE_CMDS"

if [[ "$APPLY" -ne 1 ]]; then
  log "Dry run finished. Add --apply to execute removals."
  exit 0
fi

log "Applying removals..."
: > "$APPLY_FAILED"

retry_update() {
  local service="$1"
  local region="$2"
  local keys_csv="$3"
  local attempt=1
  local max_attempts=5
  local sleep_sec=5

  while [[ "$attempt" -le "$max_attempts" ]]; do
    if gcloud run services update "$service" \
      --region="$region" \
      --project="$PROJECT_ID" \
      --remove-env-vars="$keys_csv" \
      --quiet; then
      return 0
    fi

    if [[ "$attempt" -eq "$max_attempts" ]]; then
      return 1
    fi

    log "Retrying $service ($region) in ${sleep_sec}s... (attempt ${attempt}/${max_attempts})"
    sleep "$sleep_sec"
    sleep_sec=$((sleep_sec * 2))
    attempt=$((attempt + 1))
  done
}

total=0
ok=0
ng=0

while IFS=$'\t' read -r region fn keys_csv; do
  [[ -z "$region" || -z "$fn" || -z "$keys_csv" ]] && continue
  total=$((total + 1))

  service_path="$(gcloud functions describe "$fn" --v2 --region="$region" --project="$PROJECT_ID" --format='value(serviceConfig.service)')"
  service="${service_path##*/}"

  log "[$total] Updating $fn ($region) service=$service"
  if retry_update "$service" "$region" "$keys_csv"; then
    ok=$((ok + 1))
  else
    ng=$((ng + 1))
    echo -e "$region\t$fn\t$service\t$keys_csv" >> "$APPLY_FAILED"
  fi
done < <(
  awk '{k=$1 "\t" $2; if (m[k] == "") m[k] = $3; else m[k] = m[k] "," $3}
       END {for (k in m) print k "\t" m[k]}' "$REMOVE_BY_FN_FILTERED" | LC_ALL=C sort -u
)

log "Apply completed: total=$total ok=$ok failed=$ng"
if [[ "$ng" -gt 0 ]]; then
  log "Failed rows saved to: $APPLY_FAILED"
  exit 1
fi

exit 0
