# XNT Modpack Installer - Staging Test

This document describes the staging-only test flow for the XNT modpack installer image.
It must not be used to enable public customer modpack installs.

## Scope

The staging test validates:

- the Docker image builds locally
- `xnt-install-modpack` can process a real CurseForge server pack URL
- existing files are preserved by default
- unsafe ZIP paths are rejected
- a staging server can be installed and started manually

The test does not:

- change Stripe
- change webhook handling
- change public provisioning
- enable production templates
- expose CurseForge download URLs to clients

## Prerequisites

- Docker installed on the staging/admin workstation
- A small CurseForge modpack with a server pack
- The server pack download URL retrieved server-side through the admin/worker path
- A staging-only XNT server template using the modpack installer image
- A staging server that can be reset if the test fails

Never paste the CurseForge download URL into a client-facing page or support ticket.

## Build The Image

From the repository root:

```bash
docker build -t ghcr.io/xntservers/yolks:java_17-modpack ./docker/minecraft-modpack
```

Optional local smoke test:

```bash
bash -n docker/minecraft-modpack/xnt-install-modpack
```

## Local Script Test

Use a temporary directory that does not contain customer data:

```bash
mkdir -p /tmp/xnt-modpack-test-server

docker run --rm -it \
  -v /tmp/xnt-modpack-test-server:/home/container \
  ghcr.io/xntservers/yolks:java_17-modpack \
  xnt-install-modpack \
    --url "$CURSEFORGE_SERVER_PACK_URL" \
    --modpack-id "$CURSEFORGE_MOD_ID" \
    --file-id "$CURSEFORGE_FILE_ID" \
    --server-pack-file-id "$CURSEFORGE_SERVER_PACK_FILE_ID" \
    --name "$MODPACK_NAME"
```

Expected result:

- command exits with code `0`
- files are copied into `/tmp/xnt-modpack-test-server`
- `eula.txt` exists
- logs include download, ZIP validation, extraction, and copy steps

If the command fails, keep the output and do not continue to a staging server.

## Admin Staging Procedure

1. Pick a small modpack with a CurseForge server pack.
2. Import and sync it in Admin > Game Catalog > CurseForge Cache.
3. Create or verify a mapping to a staging-only compatible template.
4. Configure only the staging template metadata:

```json
{
  "modpack_install": {
    "enabled": true,
    "command_template": "xnt-install-modpack --url \"{download_url}\" --modpack-id \"{modpack_id}\" --file-id \"{file_id}\" --server-pack-file-id \"{server_pack_file_id}\" --name \"{modpack_name}\"",
    "max_file_size_mb": 2048,
    "requires_server_pack": true,
    "supported_loaders": ["forge", "fabric", "quilt", "neoforge"],
    "notes": "Staging-only modpack installer test."
  }
}
```

5. Create a staging order/server using that template.
6. Confirm a `modpack_install_jobs` row exists with status `queued`.
7. In Admin > Modpack Jobs, run the install action manually.
8. Watch the status progress through `downloading`, `extracting`, `installing`, `configuring`, then `ready` or `failed`.
9. Open the staging server file manager and verify the expected files exist.
10. Start the staging server and inspect console logs.
11. If startup fails, stop and capture the job logs plus server console output.

## Rollback

For staging only:

1. Stop the server.
2. Restore from a manual backup if one was created.
3. Otherwise reset/recreate the staging server.
4. Disable `metadata.modpack_install.enabled` on the staging template until the issue is understood.

The installer does not delete existing files by default, so rollback still depends on a staging backup or disposable server.

## Safety Checklist

- The template is staging-only.
- `metadata.modpack_install.enabled` is false on production templates.
- The CurseForge download URL is only used server-side.
- No download URL is shown to clients.
- The server pack size is below `max_file_size_mb`.
- The server is stopped or disposable before installation.
- The job logs contain no API keys or secrets.

## Readiness Decision

Mark as ready for limited beta only when:

- image build succeeds
- local installer test succeeds
- staging server install succeeds
- server starts cleanly
- retry behavior is understood
- rollback procedure is documented for support/admins

