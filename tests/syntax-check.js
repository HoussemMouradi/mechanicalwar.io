const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const html = fs.readFileSync('index.html', 'utf8');
const entry = html.match(/<script type="module" src="(src\/main\.js\?v=[^"]+)">/)?.[1];
if (!entry) throw new Error('index.html must load a versioned src/main.js');
if (!/"three":/.test(html)) throw new Error('index.html is missing the three.js import map');

const files = fs.readdirSync('src').filter(f => f.endsWith('.js')).map(f => path.posix.join('src', f));
const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const stylesheet = html.match(/<link rel="stylesheet" href="([^"]+)">/)?.[1];
const release = entry.split('?')[1];
if (stylesheet !== `styles.css?${release}`) throw new Error('CSS and JavaScript must use the same release key');
for (const file of files) {
  if (imports[`./${file}`] !== `./${file}?${release}`) throw new Error(`Missing current release URL for ${file}`);
}
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
