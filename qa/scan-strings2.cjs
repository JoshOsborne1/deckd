const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const files = [];
for (const root of ['components', 'src', 'app']) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (p.endsWith('.tsx')) files.push(p);
    }
  }
}

const TEXT_TAGS = new Set(['Text', 'AnimatedText', 'RNText']);
function isTextTag(tag) {
  if (!tag) return false;
  if (ts.isIdentifier(tag)) return TEXT_TAGS.has(tag.text) || tag.text.endsWith('Text');
  if (ts.isPropertyAccessExpression(tag)) return isTextTag(tag.name);
  return false;
}
function typeCanBeString(t) {
  const f = t.getFlags();
  if (f & ts.TypeFlags.String || f & ts.TypeFlags.StringLiteral || f & ts.TypeFlags.TemplateLiteral) return true;
  if (f & ts.TypeFlags.Union) return t.types.some((x) => typeCanBeString(x));
  return false;
}

const parsed = ts.getParsedCommandLineOfConfigFile(path.resolve('tsconfig.json'), {}, ts.sys);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

let found = 0;
let checked = 0;

for (const f of files) {
  const sf = program.getSourceFile(f);
  if (!sf) continue;

  function visit(n, tagStack) {
    if (ts.isJsxElement(n)) {
      const tagNameNode = n.openingElement ? n.openingElement.tagName : undefined;
      const tag = tagNameNode ? tagNameNode.getText() : '?';
      const next = tagStack.concat([tag]);
      if (!isTextTag(tagNameNode)) {
        for (const c of n.children) {
          if (ts.isJsxExpression(c) && c.expression) {
            checked++;
            const t = checker.getTypeAtLocation(c.expression);
            if (typeCanBeString(t)) {
              found++;
              const line = sf.getLineAndCharacterOfPosition(c.pos).line + 1;
              console.log(`${f}:${line} [in ${tag}] ${c.expression.getText().slice(0, 90).replace(/\s+/g, ' ')} :: ${checker.typeToString(t)}`);
            }
          }
        }
      }
      ts.forEachChild(n, (ch) => visit(ch, next));
    } else if (ts.isJsxFragment(n)) {
      ts.forEachChild(n, (ch) => visit(ch, tagStack));
    } else {
      ts.forEachChild(n, (ch) => visit(ch, tagStack));
    }
  }
  visit(sf, []);
}
console.log(`--- checked=${checked} string-typed children outside Text: ${found}`);
