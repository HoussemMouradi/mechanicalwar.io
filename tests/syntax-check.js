const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
const localSources = [...html.matchAll(/<script[^>]+src=["'](?!https?:\/\/)([^"']+)["'][^>]*>/gi)]
  .map(match => fs.readFileSync(match[1], 'utf8'));
const allSources = [...scripts, ...localSources];

if (!scripts.length) {
  throw new Error('No inline game script found in index.html');
}

for (const source of allSources) {
  new vm.Script(source);
}

for (const weapon of ['ak47', 'm4', 'rpg', 'knife']) {
  if (!allSources.some(source => new RegExp(`\\b${weapon}\\s*:`).test(source))) {
    throw new Error(`Missing weapon definition: ${weapon}`);
  }
}

console.log(`Validated ${scripts.length} inline and ${localSources.length} local script blocks.`);
