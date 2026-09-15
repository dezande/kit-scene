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

## Mettre à jour le kit dans une app

```sh
git submodule update --remote src/kit   # dernière version du kit
npm run typecheck && npm test && npm run build && npm run test:e2e
git commit -am "Kit mis à jour"
npm run deploy
```

Après avoir cloné une app : `git submodule update --init`.

## Développer le kit

```sh
npm install
npm run typecheck   # node/, tests/, web/ (DOM) et sw/ (service worker)
npm test            # rotation, stamp-build dans un dépôt git temporaire, check-dist, configuration, serveur local (adresses piégées comprises)
```

Le comportement dans le navigateur (écran allumé, rotation, hors-ligne, mises à jour) est testé dans Chrome par les tests de bout en bout de chaque app.
