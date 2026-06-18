# XNT Modpack Install Template

Document interne pour préparer l'installation reelle des modpacks CurseForge sur les serveurs XNT.

## Etat actuel

Le worker modpack XNT sait deja :

- verifier un job `modpack_install_jobs`
- verifier le serveur, le modpack, la version et le mapping actif
- recuperer une URL CurseForge `download-url` cote serveur uniquement
- refuser l'installation si le template n'a pas `metadata.modpack_install.enabled = true`
- envoyer une commande controlee via l'API Client serveur si le template est explicitement active

Aucun template ne doit etre active automatiquement. L'activation reste une action admin manuelle.

## Audit images/templates

Templates Minecraft actuels observes dans les migrations :

- image : `ghcr.io/pterodactyl/yolks:java_17`
- startup : `java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}`
- repertoire de travail attendu : racine du serveur Pterodactyl (`/home/container`)

Hypotheses raisonnables mais a valider sur l'image reelle :

- `sh` est generalement disponible
- `bash` n'est pas garanti
- `curl`, `wget`, `unzip`, `rsync`, `jq` ne sont pas garantis
- le processus tourne avec l'utilisateur container, sans privileges root
- l'ecriture est limitee au repertoire serveur
- l'installation doit etre lancee serveur arrete ou avant premier demarrage pour eviter fichiers verrouilles/incoherents

Conclusion : ne pas utiliser une commande shell longue generee par XNT tant que l'image Docker ne fournit pas un script interne stable.

## Strategie recommandee

### Option recommandee : script inclus dans l'image Docker

Construire une image Minecraft XNT derivee du yolk Java, par exemple :

```text
ghcr.io/xntservers/yolks:java_17-modpack
```

Cette image doit inclure un binaire/script interne :

```text
/usr/local/bin/xnt-install-modpack
```

Avantages :

- pas de telechargement de script a l'execution
- hash/version de l'outil controle via l'image
- commandes admin courtes et audibles
- dependances installees a l'avance (`curl`, `unzip`, eventuellement `rsync`)
- comportement reproductible par template

Inconvenients :

- necessite construire et deployer une image Docker XNT
- necessite migrer les templates compatibles vers cette image

### Option acceptable plus tard : script telecharge depuis XNT

Commande qui telecharge un script signe depuis une URL XNT controlee, verifie le hash, puis execute.

Avantages :

- mise a jour rapide du script

Risques :

- depend de `curl/wget` deja presents
- surface de risque superieure si le hash n'est pas obligatoire
- plus difficile a auditer

### Option non recommandee : commande shell inline

Une commande shell longue dans `command_template` est fragile et dangereuse :

- echappement difficile de l'URL temporaire
- erreurs partielles difficiles a reprendre
- dependances inconnues
- maintenance faible

## Command template recommande

Quand l'image XNT contient le script interne, configurer le template admin avec :

```text
xnt-install-modpack --url "{download_url}" --modpack-id "{modpack_id}" --file-id "{file_id}" --server-pack-file-id "{server_pack_file_id}" --name "{modpack_name}"
```

Le socle Docker de staging est dans :

```text
docker/minecraft-modpack/
```

Build local :

```sh
docker build -t ghcr.io/xntservers/yolks:java_17-modpack ./docker/minecraft-modpack
```

Procedure de test staging :

```text
docs/modpack-staging-test.md
```

Test script optionnel sur une machine avec Docker :

```sh
CURSEFORGE_SERVER_PACK_URL="https://..." \
CURSEFORGE_MOD_ID="123" \
CURSEFORGE_FILE_ID="456" \
CURSEFORGE_SERVER_PACK_FILE_ID="789" \
MODPACK_NAME="Small Test Pack" \
scripts/test-modpack-installer.sh
```

Metadata admin recommandee :

```json
{
  "modpack_install": {
    "enabled": true,
    "command_template": "xnt-install-modpack --url \"{download_url}\" --modpack-id \"{modpack_id}\" --file-id \"{file_id}\" --server-pack-file-id \"{server_pack_file_id}\" --name \"{modpack_name}\"",
    "max_file_size_mb": 2048,
    "requires_server_pack": true,
    "supported_loaders": ["Forge", "Fabric", "NeoForge", "Quilt"],
    "notes": "Requires ghcr.io/xntservers/yolks:java_17-modpack with xnt-install-modpack installed."
  }
}
```

## Script propose

Le script ci-dessous est une specification de reference. Il doit etre integre dans l'image Docker XNT, pas injecte par l'application.

```sh
#!/usr/bin/env sh
set -eu

log() {
  printf '[xnt-install-modpack] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

DOWNLOAD_URL=""
MODPACK_ID=""
FILE_ID=""
SERVER_PACK_FILE_ID=""
MODPACK_NAME=""
MAX_BYTES="${XNT_MODPACK_MAX_BYTES:-2147483648}"
SERVER_DIR="${XNT_SERVER_DIR:-/home/container}"
WORK_ROOT="${XNT_MODPACK_WORK_ROOT:-/home/container/.xnt-modpack-install}"
OVERWRITE="${XNT_MODPACK_OVERWRITE:-false}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --url) DOWNLOAD_URL="${2:-}"; shift 2 ;;
    --modpack-id) MODPACK_ID="${2:-}"; shift 2 ;;
    --file-id) FILE_ID="${2:-}"; shift 2 ;;
    --server-pack-file-id) SERVER_PACK_FILE_ID="${2:-}"; shift 2 ;;
    --name) MODPACK_NAME="${2:-}"; shift 2 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[ -n "$DOWNLOAD_URL" ] || fail "missing --url"
[ -n "$SERVER_PACK_FILE_ID" ] || fail "missing --server-pack-file-id"

case "$DOWNLOAD_URL" in
  https://*) ;;
  *) fail "download URL must use https" ;;
esac

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v unzip >/dev/null 2>&1 || fail "unzip is required"

mkdir -p "$WORK_ROOT"
ARCHIVE="$WORK_ROOT/server-pack-$SERVER_PACK_FILE_ID.zip"
EXTRACT_DIR="$WORK_ROOT/extract-$SERVER_PACK_FILE_ID"
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"

log "downloading server pack $SERVER_PACK_FILE_ID"
curl --fail --location --silent --show-error --max-time 900 --output "$ARCHIVE" "$DOWNLOAD_URL"

SIZE="$(wc -c < "$ARCHIVE" | tr -d ' ')"
log "archive size: $SIZE bytes"
[ "$SIZE" -le "$MAX_BYTES" ] || fail "archive exceeds max size"

log "validating archive paths"
unzip -Z1 "$ARCHIVE" | while IFS= read -r path; do
  case "$path" in
    /*|../*|*/../*|*"/.."|*"$"*|*".."*) fail "unsafe archive path: $path" ;;
  esac
done

log "extracting archive"
unzip -q "$ARCHIVE" -d "$EXTRACT_DIR"

if [ -f "$EXTRACT_DIR/eula.txt" ]; then
  log "server pack provides eula.txt"
else
  log "creating eula.txt"
  printf 'eula=true\n' > "$EXTRACT_DIR/eula.txt"
fi

log "copying files into server directory"
cd "$EXTRACT_DIR"
find . -type f | while IFS= read -r file; do
  target="$SERVER_DIR/${file#./}"
  mkdir -p "$(dirname "$target")"
  if [ -e "$target" ] && [ "$OVERWRITE" != "true" ]; then
    log "keeping existing file: ${file#./}"
  else
    cp "$file" "$target"
    log "installed: ${file#./}"
  fi
done

log "installation prepared for modpack=${MODPACK_NAME:-unknown} modpack_id=${MODPACK_ID:-unknown} file_id=${FILE_ID:-unknown}"
```

## Regles de securite du script

Le script doit :

- refuser toute URL non HTTPS
- telecharger dans un dossier temporaire
- limiter la taille archive
- refuser les chemins dangereux (`../`, chemins absolus)
- ne pas supprimer les fichiers existants par defaut
- ne pas ecraser les fichiers existants sans `XNT_MODPACK_OVERWRITE=true`
- generer `eula.txt` si absent
- logguer chaque etape
- echouer avec code non-zero en cas de probleme

Le script ne doit pas :

- lire de secrets
- appeler l'API XNT
- stocker durablement l'URL CurseForge
- supprimer tout le dossier serveur
- executer du contenu fourni par l'archive

## Conditions avant activation admin

Avant de mettre `enabled=true` sur un template :

1. L'image Docker du template doit contenir `xnt-install-modpack`.
2. `curl` et `unzip` doivent etre presents.
3. Le script doit etre executable par l'utilisateur container.
4. Un test manuel doit valider l'installation sur serveur de test.
5. Le template doit etre limite aux loaders reellement supportes.
6. `max_file_size_mb` doit etre inferieur a la limite disque utile du plan.
7. Une procedure backup/rollback doit etre definie avant activation publique.

## Risques restants

- CurseForge peut fournir des packs sans server pack exploitable.
- Certains server packs ont des installateurs specifiques.
- Le premier demarrage apres installation peut encore echouer selon les mods.
- Sans backup automatique, une installation sur serveur deja utilise reste risquee.
- Les dependances natives/mods peuvent exiger une version Java specifique.

## Prochaine etape recommandee

Phase 4L / staging :

- builder l'image `docker/minecraft-modpack`
- tester manuellement Forge/Fabric sur serveur de staging
- ajouter un mode `dry-run` au script
- ajouter une option backup avant installation
- activer un seul template de test dans l'admin
