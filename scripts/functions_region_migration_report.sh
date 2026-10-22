#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID=""
FROM_REGION="us-central1"
TO_REGION="asia-northeast1"
APPLY_DELETE_OLD=0
WORK_DIR=""

usage() {
  cat <<'EOF'
Usage:
  scripts/functions_region_migration_report.sh \
    --project <gcp-project-id> \
    [--from us-central1] \
    [--to asia-northeast1] \
    [--work-dir /tmp/functions-region-migration] \
    [--apply-delete-old]

What this script does:
  1) Lists Cloud Functions v2 names in --from and --to regions
  2) Produces comparison files:
     - only_in_from.txt       (must be deployed to target region first)
     - only_in_to.txt
     - in_both.txt            (candidate for deleting old region copy)
  3) If --apply-delete-old is specified:
     - Deletes only functions that exist in BOTH regions from --from region
     - Does not delete "only_in_from" functions

Requirements:
  - gcloud
  - jq
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --from)
      FROM_REGION="${2:-}"
      shift 2
      ;;
    --to)
      TO_REGION="${2:-}"
      shift 2
      ;;
    --work-dir)
      WORK_DIR="${2:-}"
      shift 2
      ;;
    --apply-delete-old)
      APPLY_DELETE_OLD=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
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
  WORK_DIR="/tmp/functions-region-migration-${PROJECT_ID}-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$WORK_DIR"

FROM_LIST="$WORK_DIR/from_${FROM_REGION}.txt"
TO_LIST="$WORK_DIR/to_${TO_REGION}.txt"
ONLY_FROM="$WORK_DIR/only_in_${FROM_REGION}.txt"
ONLY_TO="$WORK_DIR/only_in_${TO_REGION}.txt"
IN_BOTH="$WORK_DIR/in_both.txt"
DELETE_LOG="$WORK_DIR/delete_old_region.log"

echo "[1/4] Listing functions in regions..."
gcloud functions list --v2 \
  --project "$PROJECT_ID" \
  --regions "$FROM_REGION" \
  --format=json \
  | jq -r '.[].name | split("/")[-1]' \
  | sort -u > "$FROM_LIST"

gcloud functions list --v2 \
  --project "$PROJECT_ID" \
  --regions "$TO_REGION" \
  --format=json \
  | jq -r '.[].name | split("/")[-1]' \
  | sort -u > "$TO_LIST"

echo "[2/4] Building comparison..."
comm -23 "$FROM_LIST" "$TO_LIST" > "$ONLY_FROM"
comm -13 "$FROM_LIST" "$TO_LIST" > "$ONLY_TO"
comm -12 "$FROM_LIST" "$TO_LIST" > "$IN_BOTH"

FROM_COUNT="$(wc -l < "$FROM_LIST" | tr -d ' ')"
TO_COUNT="$(wc -l < "$TO_LIST" | tr -d ' ')"
ONLY_FROM_COUNT="$(wc -l < "$ONLY_FROM" | tr -d ' ')"
ONLY_TO_COUNT="$(wc -l < "$ONLY_TO" | tr -d ' ')"
IN_BOTH_COUNT="$(wc -l < "$IN_BOTH" | tr -d ' ')"

echo "[3/4] Summary"
echo "  project:            $PROJECT_ID"
echo "  from_region:        $FROM_REGION ($FROM_COUNT functions)"
echo "  to_region:          $TO_REGION ($TO_COUNT functions)"
echo "  only_in_from:       $ONLY_FROM_COUNT"
echo "  only_in_to:         $ONLY_TO_COUNT"
echo "  in_both:            $IN_BOTH_COUNT"
echo "  work_dir:           $WORK_DIR"
echo
echo "Files:"
echo "  $FROM_LIST"
echo "  $TO_LIST"
echo "  $ONLY_FROM"
echo "  $ONLY_TO"
echo "  $IN_BOTH"

if [[ "$APPLY_DELETE_OLD" -eq 0 ]]; then
  echo
  echo "[4/4] Dry-run complete. No deletion executed."
  echo "To delete old-region copies safely, re-run with: --apply-delete-old"
  exit 0
fi

echo
echo "[4/4] Deleting old-region copies (only functions already in BOTH regions)..."
: > "$DELETE_LOG"
TOTAL=0
OK=0
NG=0

while IFS= read -r fn; do
  [[ -z "$fn" ]] && continue
  TOTAL=$((TOTAL + 1))
  if gcloud functions delete "$fn" \
    --gen2 \
    --region "$FROM_REGION" \
    --project "$PROJECT_ID" \
    --quiet >>"$DELETE_LOG" 2>&1; then
    OK=$((OK + 1))
    echo "  [OK] $fn"
  else
    NG=$((NG + 1))
    echo "  [NG] $fn (see $DELETE_LOG)"
  fi
done < "$IN_BOTH"

echo
echo "Delete finished: total=$TOTAL ok=$OK failed=$NG"
echo "Log: $DELETE_LOG"
