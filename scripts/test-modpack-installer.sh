#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="${IMAGE_TAG:-ghcr.io/xntservers/yolks:java_17-modpack}"
SERVER_DIR="${SERVER_DIR:-/tmp/xnt-modpack-test-server}"

log() {
  printf '[xnt-modpack-staging-test] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker is not installed or not available in PATH."

: "${CURSEFORGE_SERVER_PACK_URL:?Set CURSEFORGE_SERVER_PACK_URL to a server-side retrieved CurseForge server pack URL.}"
: "${CURSEFORGE_MOD_ID:?Set CURSEFORGE_MOD_ID.}"
: "${CURSEFORGE_FILE_ID:?Set CURSEFORGE_FILE_ID.}"
: "${CURSEFORGE_SERVER_PACK_FILE_ID:?Set CURSEFORGE_SERVER_PACK_FILE_ID.}"

MODPACK_NAME="${MODPACK_NAME:-Staging Modpack}"

log "building image ${IMAGE_TAG}"
docker build -t "${IMAGE_TAG}" ./docker/minecraft-modpack

log "preparing disposable server dir ${SERVER_DIR}"
mkdir -p "${SERVER_DIR}"

log "running installer in disposable container"
docker run --rm -it \
  -v "${SERVER_DIR}:/home/container" \
  "${IMAGE_TAG}" \
  xnt-install-modpack \
    --url "${CURSEFORGE_SERVER_PACK_URL}" \
    --modpack-id "${CURSEFORGE_MOD_ID}" \
    --file-id "${CURSEFORGE_FILE_ID}" \
    --server-pack-file-id "${CURSEFORGE_SERVER_PACK_FILE_ID}" \
    --name "${MODPACK_NAME}"

log "installer completed; files are in ${SERVER_DIR}"
