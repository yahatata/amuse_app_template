#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID=""
FUNCTIONS_FILE=""
FUNCTIONS_DIR=""
BATCH_SIZE=20
PAUSE_SECONDS=90
DRY_RUN=0
NON_INTERACTIVE=1

usage() {
  cat <<'EOF'
Usage:
  scripts/firebase_deploy_functions_in_batches.sh \
    --project <firebase-project-id> \
    --functions-file <path/to/function_names.txt> \
    [--functions-dir /abs/path/to/functions] \
    [--batch-size 20] \
    [--pause-seconds 90] \
    [--dry-run] \
    [--interactive]

Description:
  Deploy Firebase Functions in small batches to reduce API mutation quota spikes.
  Input file must contain one function name per line.
  Empty lines and lines starting with "#" are ignored.

Example:
  scripts/firebase_deploy_functions_in_batches.sh \
    --project amuse-app-template \
    --functions-file /tmp/functions-region-migration-xxx/only_in_us-central1.txt \
    --batch-size 15 \
    --pause-seconds 120
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --functions-file)
      FUNCTIONS_FILE="${2:-}"
      shift 2
      ;;
    --functions-dir)
      FUNCTIONS_DIR="${2:-}"
      shift 2
      ;;
    --batch-size)
      BATCH_SIZE="${2:-}"
      shift 2
      ;;
    --pause-seconds)
      PAUSE_SECONDS="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --interactive)
      NON_INTERACTIVE=0
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

if [[ -z "$FUNCTIONS_FILE" ]]; then
  echo "--functions-file is required" >&2
  usage
  exit 1
fi

if [[ ! -f "$FUNCTIONS_FILE" ]]; then
  echo "functions-file not found: $FUNCTIONS_FILE" >&2
  exit 1
fi

if ! [[ "$BATCH_SIZE" =~ ^[0-9]+$ ]] || [[ "$BATCH_SIZE" -le 0 ]]; then
  echo "--batch-size must be a positive integer" >&2
  exit 1
fi

if ! [[ "$PAUSE_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "--pause-seconds must be a non-negative integer" >&2
  exit 1
fi

if [[ -z "$FUNCTIONS_DIR" ]]; then
  ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
  FUNCTIONS_DIR="$ROOT_DIR/functions"
fi

if [[ ! -d "$FUNCTIONS_DIR" ]]; then
  echo "functions directory not found: $FUNCTIONS_DIR" >&2
  exit 1
fi

FUNCTIONS=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="$(printf '%s' "$line" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  if [[ -z "$line" ]] || [[ "$line" == \#* ]]; then
    continue
  fi
  FUNCTIONS+=("$line")
done < "$FUNCTIONS_FILE"

if [[ "${#FUNCTIONS[@]}" -eq 0 ]]; then
  echo "No functions to deploy (input file is empty after filtering)." >&2
  exit 1
fi

TOTAL="${#FUNCTIONS[@]}"
BATCH_COUNT=$(( (TOTAL + BATCH_SIZE - 1) / BATCH_SIZE ))

echo "project:        $PROJECT_ID"
echo "functions_dir:  $FUNCTIONS_DIR"
echo "functions_file: $FUNCTIONS_FILE"
echo "total:          $TOTAL"
echo "batch_size:     $BATCH_SIZE"
echo "batch_count:    $BATCH_COUNT"
echo "pause_seconds:  $PAUSE_SECONDS"
echo "dry_run:        $DRY_RUN"
echo

for ((batch=0; batch<BATCH_COUNT; batch++)); do
  start=$((batch * BATCH_SIZE))
  end=$((start + BATCH_SIZE))
  if [[ "$end" -gt "$TOTAL" ]]; then
    end="$TOTAL"
  fi

  batch_len=$((end - start))
  batch_items=("${FUNCTIONS[@]:start:batch_len}")
  only_arg=""
  for fn in "${batch_items[@]}"; do
    if [[ -n "$only_arg" ]]; then
      only_arg+=","
    fi
    only_arg+="functions:${fn}"
  done

  echo "[$((batch + 1))/$BATCH_COUNT] Deploy target count: ${#batch_items[@]}"
  echo "  --only ${only_arg}"

  if [[ "$DRY_RUN" -eq 0 ]]; then
    if [[ "$NON_INTERACTIVE" -eq 1 ]]; then
      (
        cd "$FUNCTIONS_DIR"
        FIREBASE_SKIP_UPDATE_CHECK=true firebase deploy \
          --only "$only_arg" \
          --project "$PROJECT_ID" \
          --non-interactive
      )
    else
      (
        cd "$FUNCTIONS_DIR"
        FIREBASE_SKIP_UPDATE_CHECK=true firebase deploy \
          --only "$only_arg" \
          --project "$PROJECT_ID"
      )
    fi
  fi

  if [[ "$batch" -lt $((BATCH_COUNT - 1)) ]] && [[ "$PAUSE_SECONDS" -gt 0 ]]; then
    echo "  sleeping ${PAUSE_SECONDS}s before next batch..."
    sleep "$PAUSE_SECONDS"
  fi
done

echo
echo "Done."
