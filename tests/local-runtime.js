const fs = require('node:fs');
const path = require('node:path');

// Use exactly the pinned runtime from the import map, without depending on CDN
// availability. The shipped static site retains its regular CDN import map.
async function localRuntime(context) {
  const root = path.resolve(path.dirname(require.resolve('three')), '..');
  await context.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', route => {
    const rel = route.request().url().split('/three@0.160.0/')[1];
    return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, rel)) });
  });
  await context.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  // Font availability is unrelated to gameplay; system fallbacks are intentional.
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
}
module.exports = { localRuntime };
