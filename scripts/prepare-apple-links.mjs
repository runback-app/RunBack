// Use the verified App ID prefix from the Apple Developer portal, not a guess.
import { mkdir, writeFile } from 'node:fs/promises';
const id = process.argv[2];
if (!/^[A-Z0-9]{10}\.net\.runback\.app$/.test(id ?? '')) {
  console.error('Usage: npm run app:links -- VERIFIED_APP_ID_PREFIX.net.runback.app');
  process.exit(1);
}
const components = [
  { '#': '?*', exclude: true, comment: 'Authentication fragments stay in the browser.' },
  ...['code', 'error', 'token_hash'].map(key => ({ '?': { [key]: '?*' }, exclude: true })),
  ...['join', 'add', 'run', 'crew', 'court', 'player'].map(path => ({ '/': `/${path}/*` })),
  { '/': '/updates' },
];
await mkdir('public/.well-known', { recursive: true });
await writeFile('public/.well-known/apple-app-site-association', JSON.stringify({ applinks: { details: [{ appIDs: [id], components }] } }, null, 2) + '\n');
console.log('Prepared Apple website association. Deploy it before testing a signed iPhone installation.');
