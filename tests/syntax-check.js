const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const html = fs.readFileSync('index.html', 'utf8');
if (!/<script type="module" src="src\/main\.js">/.test(html)) throw new Error('index.html does not load src/main.js');
if (!/"three":/.test(html)) throw new Error('index.html is missing the three.js import map');

const files = fs.readdirSync('src').filter(f => f.endsWith('.js')).map(f => path.join('src', f));
for (const file of files) {
  execFileSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(file) });
}

const config = fs.readFileSync('src/config.js', 'utf8');
for (const weapon of ['glock', 'mp5', 'ump45', 'scar', 'nova', 'ak47', 'm4a4', 'awp', 'rpg', 'knife']) {
  if (!new RegExp(`\\b${weapon}\\s*:`).test(config)) throw new Error(`Missing weapon definition: ${weapon}`);
}
for (const team of ["key: 'AUTO'", "key: 'DJB'", "key: 'RH'"]) {
  if (!config.includes(team)) throw new Error(`Missing team: ${team}`);
}

console.log(`Syntax OK for ${files.length} modules.`);
