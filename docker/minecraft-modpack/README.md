# XNT Minecraft Modpack Image

Image Docker de staging pour les templates Minecraft compatibles modpacks.

Elle ajoute le script interne `xnt-install-modpack` a une base Java Pterodactyl. Aucun template XNT n'est active automatiquement par ce dossier.

## Contenu

- `Dockerfile` : derive de `ghcr.io/pterodactyl/yolks:java_17`
- `xnt-install-modpack` : script d'installation server pack CurseForge

## Build local

Depuis la racine du projet :

```sh
docker build -t ghcr.io/xntservers/yolks:java_17-modpack ./docker/minecraft-modpack
```

## Test local du script

Creer un zip de test :

```sh
tmp="$(mktemp -d)"
mkdir -p "$tmp/pack/config"
printf 'eula=true\n' > "$tmp/pack/eula.txt"
printf 'example=true\n' > "$tmp/pack/config/xnt-test.conf"
(cd "$tmp/pack" && zip -qr "$tmp/server-pack.zip" .)
```

Lancer un serveur HTTP local pour simuler une URL de telechargement HTTPS n'est pas trivial en local. Pour un test de script hors contrainte HTTPS, utiliser une URL de staging XNT ou un environnement de test qui expose le zip en HTTPS.

Test dans le conteneur avec un server pack HTTPS :

```sh
docker run --rm -it \
  -v "$PWD/.tmp-server:/home/container" \
  ghcr.io/xntservers/yolks:java_17-modpack \
  xnt-install-modpack \
    --url "https://example.invalid/server-pack.zip" \
    --modpack-id "1" \
    --file-id "2" \
    --server-pack-file-id "3" \
    --name "Staging Pack"
```

## Push GHCR plus tard

```sh
docker login ghcr.io
docker push ghcr.io/xntservers/yolks:java_17-modpack
```

## Lier l'image au template admin

1. Creer ou selectionner un template Minecraft de staging.
2. Definir son image Docker interne sur :

```text
ghcr.io/xntservers/yolks:java_17-modpack
```

3. Dans `Admin > Game Catalog > Server Templates > Modpack`, configurer :

```text
xnt-install-modpack --url "{download_url}" --modpack-id "{modpack_id}" --file-id "{file_id}" --server-pack-file-id "{server_pack_file_id}" --name "{modpack_name}"
```

4. Garder `enabled=false` tant que le test staging n'est pas valide.
5. Activer uniquement un template de test au debut.

## Limites avant production

- Pas de backup automatique avant installation.
- Pas de rollback automatique.
- Pas de verification de hash CurseForge.
- Le script conserve les fichiers existants par defaut et ne supprime rien.
- Certains server packs peuvent exiger une procedure specifique.
- L'installation doit idealement etre lancee serveur arrete ou avant premier demarrage.
