#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
KEYSTORE_ROOT="${SCRIPT_DIR}/keystores"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "❌ .env tidak ditemukan di ${SCRIPT_DIR}." >&2
  exit 1
fi

mkdir -p "${KEYSTORE_ROOT}"

set -a
# shellcheck source=/dev/null
source "${ENV_FILE}"
set +a

LABELS=(UGM ITB UI UB ITS)
declare -a collected_paths=()

for label in "${LABELS[@]}"; do
  var_name="${label}_REMOTE_KEYSTORE_SRC_PATHS"
  sources_raw="${!var_name:-}"

  if [[ -z "${sources_raw// }" ]]; then
    echo "⚠️  Remote keystore untuk ${label} belum dikonfigurasi, lewati." >&2
    continue
  fi

  IFS=',' read -r -a sources <<< "${sources_raw}"
  dest_dir="${KEYSTORE_ROOT}/${label}"
  mkdir -p "${dest_dir}"

  for src in "${sources[@]}"; do
    trimmed="$(echo "${src}" | xargs)"
    if [[ -z "${trimmed}" ]]; then
      continue
    fi

    echo "🔄 Menyinkronkan keystore ${label} dari ${trimmed}"
    rsync -av --delete "${trimmed%/}/" "${dest_dir}/"
  done

  shopt -s nullglob
  keystore_files=("${dest_dir}"/UTC--*)
  shopt -u nullglob

  if (( ${#keystore_files[@]} == 0 )); then
    echo "⚠️  Tidak ada file keystore UTC--* ditemukan untuk ${label}." >&2
  else
    echo "✅ ${#keystore_files[@]} file keystore ditemukan untuk ${label}."
    collected_paths+=("${dest_dir}")
  fi
done

if (( ${#collected_paths[@]} > 0 )); then
  echo
  echo "Sertakan nilai berikut di .env atau ekspor sebelum menjalankan pipeline:"
  joined_paths=""
  for path in "${collected_paths[@]}"; do
    display_path="${path}"
    if [[ "${display_path}" == ${HOME}* ]]; then
      display_path="~${display_path#${HOME}}"
    fi
    if [[ -n "${joined_paths}" ]]; then
      joined_paths+="${display_path},"
    else
      joined_paths+="${display_path},"
    fi
  done
  joined_paths="${joined_paths%,}"
  echo "KEYSTORE_SRC_PATHS=\"${joined_paths}\""
fi
