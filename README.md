# kit-scene

Code commun des accessoires de scène publiés en PWA hors-ligne sur `dezande.github.io` :
[Analyseur Q](https://github.com/dezande/analyseur-q) et [Boule de cristal](https://github.com/dezande/boule-de-cristal).
Une correction faite ici profite à toutes les apps, sans copier de code.

Aucune dépendance à l'exécution. TypeScript sert à vérifier les types ; chaque app compile le kit avec son propre code.

## Contenu

| Dossier | Rôle |
| --- | --- |
| `web/wake-lock.ts` | Écran toujours allumé : Screen Wake Lock API **et** vidéo muette en boucle, créée par le module (l'API seule ne suffit pas sur iPhone avant iOS 18.4, dans l'app installée) |
| `web/orientation.ts` | Toujours en portrait : sur iPhone, `#app` pivote quand le téléphone est en paysage ; `appPoint()` convertit les touchers |
| `web/orientation-logic.ts` | Calculs de la rotation, testés sous Node |
| `web/updates.ts` | Service worker, recherche et installation des nouvelles versions, rechargement seulement quand l'app le permet |
| `web/storage.ts` | Lecture et écriture sûres du localStorage (anciennes clés comprises), stockage persistant |
| `web/build.ts` | Numéro de version et commit, remplis au build |
| `web/dom.ts` | `$()` : querySelector qui échoue bruyamment |
| `sw/sw.ts` | Service worker : tout en cache, servi hors-ligne ; ne supprime que les caches de son app |
| `styles/_app.scss` | Enveloppe `#app` et sa rotation, marges de sécurité |
| `node/stamp-build.ts` | Fin du build : version, liste des fichiers en cache, nom du cache (empreinte du contenu, version comprise) |
| `node/check-dist.ts` | Vérifie que le build est complet |
| `node/check-changelog.ts` | Vérifie le journal des versions, et qu'aucune modification n'arrive sans une ligne dedans |
| `node/serve.ts`, `node/static-server.ts` | Serveur local de `dist/` |
| `node/deploy.ts` | Vérifie tout en local (kit publié compris), pousse, suit GitHub Actions et contrôle le site |
| `node/chrome.ts` | Pilotage de Chrome sans interface pour les tests de bout en bout des apps |

## Utiliser le kit dans une app

Le kit est un **sous-module git** monté dans `src/kit/` : chaque app pointe sur une version précise du kit, qu'elle teste avant de la publier.

```sh
git submodule add https://github.com/dezande/kit-scene.git src/kit
```

**package.json** de l'app :

```json
{
	"homepage": "https://dezande.github.io/mon-app/",
	"kit": {
		"name": "Mon app",
		"cachePrefix": "mon-app",
		"legacyCachePrefixes": ["ancien-nom"],
		"requiredFiles": ["content/slides.js"]
	},
	"scripts": {
		"build": "… && tsc -p src && tsc -p src/sw && node src/kit/node/check-dist.ts && node src/kit/node/stamp-build.ts",
		"serve": "npm run build && node src/kit/node/serve.ts",
		"deploy": "node src/kit/node/deploy.ts"
	}
}
```

`cachePrefix` doit être propre à l'app : toutes les apps de `dezande.github.io` partagent le même espace de caches.

**Compilation** : `src/tsconfig.json` inclut `"kit/web"` ; `src/sw/tsconfig.json` compile `../kit/sw/sw.ts` en `dist/sw.js` (`"rootDir": "../kit/sw"`).

**Page** :

- tout l'affichage dans `<div id="app">`, styles avec `@use "../kit/styles/app";`, et `--app-w` / `--app-h` au lieu de `vw` / `vh` ;
- Content-Security-Policy avec `media-src 'self' data:` (vidéo muette) ;
- `manifest.json` avec `"orientation": "portrait"` ;
- importer `kit/web/orientation.ts` avant les modules qui mesurent l'écran ; convertir les touchers avec `appPoint()` ;
- appeler `keepScreenAwake()` à chaque toucher, `setupUpdates({ canReload })` au démarrage.

**GitHub Actions** : `actions/checkout` avec `submodules: true` et `fetch-depth: 0`.

## Règles de la branche main

`main` est protégée dans le kit comme dans les apps :

- **aucun push direct**, même pour le propriétaire : tout passe par une pull request ;
- **historique linéaire** : fusion en rebase seulement (ni commit de fusion, ni squash) ;
- **la CI doit être verte** pour fusionner, et la branche doit être à jour ;
- la branche est supprimée après la fusion, et la fusion automatique (`--auto`) est autorisée.

`npm run deploy` suit ces règles : il vérifie tout en local, ouvre la pull request, demande la fusion automatique en rebase, attend la CI puis la fusion, et suit enfin la mise en ligne.

## Mettre à jour le kit dans une app

```sh
git submodule update --remote src/kit   # dernière version du kit
npm run typecheck && npm test && npm run build && npm run test:e2e
git commit -am "Kit mis à jour"
npm run deploy
```

Après avoir cloné une app : `git submodule update --init`.

## Versions

Chaque version publiée du kit porte une étiquette git (`v1.0.0`) et une publication GitHub ; les changements sont décrits dans [CHANGELOG.md](CHANGELOG.md).

**Rien ne change sans une ligne dans le journal.** Ce que vous faites s'écrit sous `## [Non publié]`, en tête du journal ; l'intégration continue le vérifie à chaque pull request et à chaque arrivée sur `main`, et refuse un changement qui ne s'explique pas :

```sh
npm run check:changelog   # forme du journal
node node/check-changelog.ts --base main   # et : ai-je dit ce que je change ?
```

Un commit qui ne touche vraiment à rien (espaces, renommage sans effet) peut porter `[sans journal]` dans son message pour en être dispensé.

`main` est protégée : pas de poussée directe, pas de poussée forcée, pas de suppression. Tout passe par une pull request dont le contrôle « Types, tests et journal » doit être vert — c'est lui qui refuse un changement sans journal. Aucune relecture n'est exigée : vous fusionnez vous-même une fois la CI passée.

La fusion se fait **par rebase seulement** : pas de commit de fusion, pas d'écrasement, l'historique de `main` reste une ligne droite de commits qui ont chacun été vérifiés. La branche doit en outre être **à jour avec `main`** avant la fusion, donc les tests qui autorisent le passage portent sur le code tel qu'il arrivera sur `main`, et non sur une version périmée.

L'auto-merge est activé : `gh pr merge --auto --rebase` demande la fusion à l'avance, et GitHub la fait tout seul dès que la CI est verte — inutile de rester devant. La branche est supprimée après la fusion par GitHub lui-même, donc même quand vous avez fermé le terminal. Si `main` bouge entre-temps, la pull request redevient en retard : remettez-la sur `main` (`git pull --rebase origin main && git push --force-with-lease`, ou le bouton « Update branch »), la CI repasse et l'auto-merge reprend la main.

```sh
git switch -c ma-modification
# … travailler, et écrire ce qu'on a fait sous « ## [Non publié] » …
git commit -am "Ce que j'ai fait"
git push -u origin ma-modification
gh pr create --fill
gh pr merge --auto --rebase   # fusionne tout seul dès que la CI est verte, puis supprime la branche
# si main a bougé entre-temps : se remettre dessus, la CI repasse sur le résultat
git pull --rebase origin main && git push --force-with-lease
```

Une app s'accroche à une version nommée plutôt qu'à un commit quelconque :

```sh
git -C src/kit fetch --tags
git -C src/kit checkout v1.0.0
git commit -am "Kit v1.0.0"
```

**Publier une nouvelle version du kit.** La version se prépare dans une pull request comme le reste ; l'étiquette est posée ensuite sur `main`, où la protection ne s'applique pas aux étiquettes.

```sh
git switch -c version-1.1.0
npm run typecheck && npm test && npm run check:changelog
# dans CHANGELOG.md : renommer « ## [Non publié] » en « ## [1.1.0] — 2026-09-16 »
# et ajouter le lien « [1.1.0]: …/releases/tag/v1.1.0 » en bas, puis :
git commit -am "Version 1.1.0"
git push -u origin version-1.1.0 && gh pr create --fill
gh pr merge --auto --rebase && gh pr checks --watch

git switch main && git pull
git tag -a v1.1.0 -m "Version 1.1.0" && git push origin v1.1.0
gh release create v1.1.0 --title "v1.1.0" --notes "Voir CHANGELOG.md."   # publication GitHub
```

Le numéro suit le [versionnage sémantique](https://semver.org/lang/fr/) : MAJEUR quand une app existante doit être adaptée, MINEUR pour un ajout, CORRECTIF pour une correction. Une app n'est jamais obligée de suivre : elle reste sur la version qu'elle a testée.

## Développer le kit

```sh
npm install
npm run typecheck   # node/, tests/, web/ (DOM) et sw/ (service worker)
npm test            # rotation, stamp-build dans un dépôt git temporaire, check-dist, configuration, serveur local (adresses piégées comprises), journal des versions
npm run check:changelog   # le journal lui-même
```

Le comportement dans le navigateur (écran allumé, rotation, hors-ligne, mises à jour) est testé dans Chrome par les tests de bout en bout de chaque app.
