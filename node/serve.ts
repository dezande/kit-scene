// Serveur statique local pour dist/ de l'app, sans dépendance.
// Usage (depuis la racine de l'app) : npm run serve   (port modifiable : PORT=3000 npm run serve)
import { readKitConfig } from './config.ts';
import { startStaticServer } from './static-server.ts';

const PORT = Number(process.env.PORT) || 8000;

const { url } = await startStaticServer('dist', PORT, (line) => console.log(line));
console.log(`${readKitConfig().name} : ${url} (Ctrl+C pour arrêter)`);
