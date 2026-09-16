# Journal des versions

Toutes les modifications notables du kit sont notées ici, la plus récente en premier.

Les numéros suivent le [versionnage sémantique](https://semver.org/lang/fr/) : `MAJEUR.MINEUR.CORRECTIF`.

| Partie | Quand elle augmente | Ce que l'app doit faire |
| --- | --- | --- |
| MAJEUR | l'API du kit change : une app existante ne compile plus ou ne se comporte plus pareil | lire la section « Ruptures » avant de mettre à jour |
| MINEUR | nouveau module, nouvelle option, comportement ajouté sans rien casser | mettre à jour quand elle veut |
| CORRECTIF | correction de bogue, test, documentation | mettre à jour sans crainte |

Chaque version correspond à une étiquette git (`v1.0.0`) et à une publication GitHub.

## [1.1.0] — 2026-09-16

Le journal des versions devient une règle vérifiée : rien n'arrive sur `main` sans être expliqué ici.
Pour les apps, rien à changer ; celles qui tiennent un journal peuvent lancer le même contrôle avec
`node src/kit/node/check-changelog.ts`.

### Ajouté

- `node/deploy.ts` publie par **pull request** : `main` est protégée (aucun push direct, historique linéaire, CI verte obligatoire), la pull request est créée puis fusionnée en rebase par la fusion automatique ; le script suit la CI, la fusion et la mise en ligne.
- `node/check-changelog.ts` : vérifie le journal — versions numérotées, datées, en ordre décroissant, sans doublon, avec du contenu et un lien vers la publication — et, avec `--base <ref>`, qu'aucune modification n'arrive sans une ligne dans le journal.
- `tests/check-changelog.test.ts` : chaque défaut de forme refusé avec sa raison ; dans un dépôt git temporaire, code modifié sans journal refusé, avec journal accepté, journal seul accepté, commit marqué `[sans journal]` accepté, base inconnue ignorée.
- CI : étape « Journal des versions », sur `main` comme en pull request ; `npm run check:changelog` fait la même vérification en local.
- `.nvmrc` : version de Node figée (24) pour tout le monde, machines de développement comme CI (`node-version-file` dans le workflow, `engines` limité à Node 24).

### Modifié

- `main` protégée : poussée directe, poussée forcée et suppression refusées ; tout passe par une pull request dont le contrôle « Types, tests et journal » doit être vert, sans relecture exigée. La règle « rien ne change sans une ligne dans le journal » est donc appliquée, et non plus seulement constatée après coup.
- Fusion par rebase seulement (ni commit de fusion ni écrasement) et branche obligatoirement à jour avec `main` : l'historique reste une ligne droite, et les tests qui autorisent la fusion portent sur le code tel qu'il arrivera sur `main`.
- Auto-merge activé : `gh pr merge --auto --rebase` fait fusionner la pull request dès que la CI est verte, sans attendre devant l'écran ; le bouton « Update branch » est toujours proposé quand `main` a bougé.
- README : les règles de `main` sont dites à un seul endroit (« Règles de la branche main »), avec la marche à suivre à la main ; la section « Versions » ne parle plus que du journal et des publications.
- Suppression automatique des branches après la fusion, faite par GitHub : `gh pr merge --delete-branch` ne supprimait rien quand la fusion arrivait plus tard, `gh` n'étant plus là pour le faire.

## [1.0.0] — 2026-09-15

Première version stable : les deux apps publiées (Analyseur Q, Boule de cristal) peuvent s'y accrocher.

### Ajouté

- `tests/static-server.test.ts` : types renvoyés, `index.html`, 404, `HEAD`, et surtout les adresses piégées (`../`, encodées, antislash) qui ne doivent jamais sortir du dossier servi, ainsi que les adresses mal encodées.
- `tests/check-dist.test.ts` : un build complet est accepté ; un fichier de base, un fichier du kit, une icône ou un fichier requis manquant est refusé avec la raison ; un service worker étranger et une configuration absente sont refusés.
- `readKitConfig()` : valeurs par défaut et validation du préfixe de cache (dans `tests/check-dist.test.ts`).

- Ce journal des versions, et la marche à suivre pour publier une version du kit ou en accrocher une dans une app (README, section « Versions »).

### Modifié

- README : la liste des tests décrit ce qui est réellement couvert.

## [0.1.0] — 2026-09-15

Mise en commun du code partagé par les accessoires de scène, jusque-là copié d'une app à l'autre.

### Ajouté

- `web/wake-lock.ts` : écran toujours allumé, par la Screen Wake Lock API **et** une vidéo muette en boucle créée par le module (l'API seule ne suffit pas sur iPhone avant iOS 18.4, dans l'app installée).
- `web/orientation.ts` et `web/orientation-logic.ts` : verrou portrait — sur iPhone, `#app` pivote quand le téléphone est en paysage ; `appPoint()` convertit les touchers ; les calculs sont testés sous Node.
- `web/updates.ts` : recherche et installation des nouvelles versions du service worker, rechargement seulement quand l'app le permet.
- `web/storage.ts` : lecture et écriture sûres du localStorage (anciennes clés comprises), stockage persistant.
- `web/build.ts` et `web/dom.ts` : numéro de version et commit remplis au build ; `$()`, un `querySelector` qui échoue bruyamment.
- `sw/sw.ts` : service worker hors-ligne qui met tout en cache et ne supprime que les caches de son app.
- `styles/_app.scss` : enveloppe `#app`, sa rotation et les marges de sécurité.
- `node/stamp-build.ts` et `node/check-dist.ts` : fin et vérification du build, configurés par le champ `kit` de `package.json` ; le nom du cache est une empreinte du contenu, version comprise.
- `node/serve.ts` et `node/static-server.ts` : serveur local de `dist/`.
- `node/deploy.ts` : vérifie tout en local (kit publié compris), pousse, suit GitHub Actions et contrôle le site.
- `node/chrome.ts` : pilotage de Chrome sans interface pour les tests de bout en bout des apps.
- Outillage : `tsconfig` séparés pour `node/`, `web/` (DOM) et `sw/` (service worker), `.editorconfig`, intégration continue GitHub Actions.

[1.1.0]: https://github.com/dezande/kit-scene/releases/tag/v1.1.0
[1.0.0]: https://github.com/dezande/kit-scene/releases/tag/v1.0.0
[0.1.0]: https://github.com/dezande/kit-scene/releases/tag/v0.1.0
