const fs = require('fs');
const path = require('path');
const roots = ['components', 'src', 'app'];
const out = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
}
roots.forEach(walk);
const patterns = [
  // conditional string expressions: {cond && 'text'} / {cond ? 'a' : 'b'} / {cond || 'text'}
  /\{\s*[^}]*\?\s*['"`][^'"`]*['"`]\s*:\s*['"`][^'"`]*['"`][^}]*\}/,
  /\{\s*[^}]*&&\s*['"`][^'"`]*['"`]\s*\}/,
  /\{\s*[^}]*\|\|\s*['"`][^'"`]*['"`]\s*\}/,
];
let hits = 0;
for (const f of out) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    // Skip lines that are inside <Text>...</Text> already? Hard; just flag and let caller check.
    for (const re of patterns) {
      if (re.test(line)) {
        // crude: skip if this line also contains <Text or is inside a Text block
        hits++;
        console.log(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`);
        break;
      }
    }
  });
}
console.log(`--- ${hits} candidate lines`);
