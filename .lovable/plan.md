## Goal

Let users pick the exact server flavor when they deploy (Paper / Forge / Fabric / Vanilla / CurseForge for Minecraft, Ark with mods, Conan, Rust, etc.), fill in version & options pulled live from the panel, change them later, and search CurseForge by name instead of pasting IDs.

## Changes

### 1. Plans — allow multiple eggs per plan

Plans become resource tiers (RAM / CPU / disk). Each plan offers one or more "variants" (egg choices).

- Migration: add `allowed_eggs jsonb` to `public.plans`:
  ```json
  [
    { "nest_id": 1, "egg_id": 5, "label": "Paper", "docker_image": "...", "startup": "..." },
    { "nest_id": 1, "egg_id": 6, "label": "Forge" },
    { "nest_id": 1, "egg_id": 8, "label": "CurseForge Modpack" }
  ]
  ```
  Fields beyond `nest_id`/`egg_id`/`label` are optional overrides. If `allowed_eggs` is empty, the current single egg on the plan is used (backward compatible).

### 2. Deploy flow — variant + dynamic variables

New server functions in `src/lib/pterodactyl.server.ts` / `servers.functions.ts`:

- `listPlanVariants(planId)` → returns the variants with their egg name fetched from the panel.
- `getEggDetails(nestId, eggId)` → returns variables with `name, env_variable, default_value, rules, description`.

`deploy.tsx` is reworked to: pick plan → pick variant → render a form generated from the egg's variables (text / number / select, parsed from Pterodactyl rules strings like `in:vanilla,paper,forge`). `deployServer` accepts `{ planId, variantIndex, serverName, environment }` and uses the variant's egg/image/startup.

### 3. Manage page — "Startup & Variables" tab (edit anytime)

New tab in `src/routes/_authenticated/manage.$orderId.tsx`:

- `getServerStartup(orderId)` — fetches current vars from the panel (`/servers/{id}/startup` on the client API, or app API include=variables).
- `updateServerStartup(orderId, environment)` → `PATCH /api/application/servers/{id}/startup` then `POST /reinstall` when version/modpack changed (with a confirm dialog: "this wipes server files").

Form is the same dynamic renderer as deploy.

### 4. CurseForge search

When an egg variable's `env_variable` matches a CurseForge pattern (`CF_PROJECT_ID`, `PROJECT_ID`, `MODPACK_ID`, `CF_FILE_ID`, `FILE_ID`), the deploy & startup forms swap the plain inputs for a **CurseForge picker**:

- Search box → calls new `searchCurseforge(query)` server fn → list of modpacks with thumbnail.
- Pick a modpack → list its files (versions) → pick one → both `CF_PROJECT_ID` and `CF_FILE_ID` are filled.

Backed by `https://api.curseforge.com` — requires a `CURSEFORGE_API_KEY` secret. I'll add it once you confirm.

### 5. Admin UI tweak

Admin "Plans" form gets an "Allowed eggs" editor (add/remove rows, each with nest id, egg id, label). Keep the old single nest/egg fields for plans that have no variants list yet.

## Files

- **Migration**: `plans.allowed_eggs jsonb not null default '[]'::jsonb`
- **Edit** `src/lib/pterodactyl.server.ts` — add `getEggDetails`, `getServerStartupApp`, `reinstallServer`, `updateServerStartupApp`
- **Edit** `src/lib/servers.functions.ts` — add `listPlanVariants`, `getEggVariables`, `getServerStartup`, `updateServerStartup`; rework `deployServer`
- **New** `src/lib/curseforge.functions.ts` — `searchCurseforge`, `listCurseforgeFiles`
- **New** `src/components/egg-variables-form.tsx` — dynamic var renderer + CurseForge picker
- **Edit** `src/routes/_authenticated/deploy.tsx` — variant picker + var form
- **Edit** `src/routes/_authenticated/manage.$orderId.tsx` — Startup tab
- **Edit** `src/routes/_authenticated/admin.tsx` — allowed_eggs editor

## What I need from you

1. **Approve this plan** so I can start building.
2. After approval I'll request a **CurseForge API key** (free, generated at https://console.curseforge.com/?#/api-keys) and store it as a secret.

No other secrets needed — Paper / Forge / Fabric / Ark / Rust variants are all driven by the panel data you already configured.
