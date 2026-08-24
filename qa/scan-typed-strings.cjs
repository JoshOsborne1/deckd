const ts = require('typescript');
const path = require('path');

const configPath = path.resolve('tsconfig.json');
const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, ts.sys);
if (!parsed) throw new Error('could not parse tsconfig');
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

const TEXT_TAGS = new Set(['Text', 'AnimatedText', 'RNText']);
function isTextTag(tag) {
  if (!tag) return false;
  if (ts.isIdentifier(tag)) return TEXT_TAGS.has(tag.text) || tag.text.endsWith('Text');
  if (ts.isPropertyAccessExpression(tag)) return isTextTag(tag.name);
  return false;
}

function typeCanBeString(type) {
  const flags = type.getFlags();
  if (flags & ts.TypeFlags.String) return true;
  if (flags & ts.TypeFlags.StringLiteral) return true;
  if (flags & ts.TypeFlags.TemplateLiteral) return true;
  if (flags & ts.TypeFlags.Union) {
    for (const t of type.types) if (typeCanBeString(t)) return true;
  }
  return false;
}

let found = 0;
let checked = 0;

for (const sf of program.getSourceFiles()) {
  const f = sf.fileName;
  if (!/\.tsx$/.test(f)) continue;
  if (f.includes('node_modules') || f.includes('.expo')) continue;

  function visit(node) {
    if (ts.isJsxElement(node) && node.tagName && !isTextTag(node.tagName)) {
      for (const child of node.children) {
        if (ts.isJsxExpression(child) && child.expression) {
          checked++;
          const type = checker.getTypeAtLocation(child.expression);
          if (typeCanBeString(type)) {
            const txt = child.expression.getText().slice(0, 120).replace(/\s+/g, ' ');
            found++;
            console.log(`${f}:${sf.getLineAndCharacterOfPosition(child.pos).line + 1}: ${txt}  ::  ${checker.typeToString(type)}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

console.log(`--- ${found} string-typed children outside <Text> (of ${checked} checked)`);
