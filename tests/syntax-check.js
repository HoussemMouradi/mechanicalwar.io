const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);

if (!scripts.length) {
  throw new Error('No inline game script found in index.html');
}

for (const source of scripts) {
  new vm.Script(source);
}

console.log(`Validated ${scripts.length} inline script block.`);
