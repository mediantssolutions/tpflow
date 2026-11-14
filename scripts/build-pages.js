import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORES, ROUTES } from '../assets/stores.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = await readFile(resolve(root, 'templates/survey.html'), 'utf8');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
for (const [slug, key] of Object.entries(ROUTES)) {
  const store = STORES[key];
  let html = template;
  for (const [name, value] of Object.entries({ STORE_NAME: store.name, SUPPORT_EMAIL: store.support_email, HOME_URL: store.home_url })) html = html.replaceAll('{{' + name + '}}', escape(value));
  if (/{{\w+}}/.test(html)) throw new Error('Unresolved build placeholder');
  await mkdir(resolve(root, slug), { recursive: true });
  await writeFile(resolve(root, slug, 'index.html'), html);
  await writeFile(resolve(root, slug, 'thankyou.html'), html);
}
const links = Object.values(STORES).map(store => '      <li><a href="' + store.slug + '/">' + escape(store.name) + '</a></li>').join('\n');
await writeFile(resolve(root, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Shoppers Survey Hub</title><link rel="stylesheet" href="assets/survey.css"></head>
<body><main class="survey-container"><h2>Shoppers Survey Hub</h2><p>Please open the survey link in your invitation email. Store previews below cannot be submitted without a valid invitation.</p><ul>\n${links}\n    </ul></main></body></html>\n`);
console.log('Built eight current brand routes and five invitation-compatible aliases.');
