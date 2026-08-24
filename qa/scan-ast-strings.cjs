const parser = require('@babel/parser');
const fs = require('fs');
const path = require('path');
const roots = ['components', 'src', 'app'];
const files = [];

function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx$/.test(e.name)) files.push(p);
  }
}
roots.forEach(walk);

const TEXT_TAGS = new Set(['Text', 'AnimatedText', 'RNText']);

function textTag(node) {
  if (node.type === 'JSXIdentifier') {
    return TEXT_TAGS.has(node.name) || node.name.endsWith('Text');
  }
  if (node.type === 'JSXMemberExpression') return textTag(node.property);
  return false;
}

// String-ish expressions that can yield a bare string child at runtime.
function stringy(node) {
  if (!node) return false;
  switch (node.type) {
    case 'StringLiteral':
    case 'TemplateLiteral':
      return true;
    case 'ParenthesizedExpression':
      return stringy(node.expression);
    case 'ConditionalExpression':
      return stringy(node.consequent) && stringy(node.alternate);
    case 'LogicalExpression':
      return stringy(node.right);
    case 'Identifier':
    case 'MemberExpression':
    case 'CallExpression':
      return true;
    default:
      return false;
  }
}

let found = 0;
let jsxCount = 0;
let exprCount = 0;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let ast;
  try {
    ast = parser.parse(src, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
  } catch (e) {
    console.log(`PARSE FAIL ${f}: ${e.message.split('\n')[0]}`);
    continue;
  }

  function visit(node) {
    if (node.type === 'JSXElement') {
      jsxCount++;
      const textParent = textTag(node.openingElement.name);
      if (!textParent) {
        for (const child of node.children) {
          if (child.type === 'JSXText') {
            const t = child.value.trim();
            if (t.length > 0) {
              found++;
              console.log(`${f}:${child.loc.start.line}: RAW TEXT '${t.slice(0, 60)}'`);
            }
          } else if (child.type === 'JSXExpressionContainer' && child.expression) {
            exprCount++;
            if (stringy(child.expression)) {
              const txt = child.expression.type === 'StringLiteral'
                ? JSON.stringify(child.expression.value)
                : child.expression.type;
              found++;
              console.log(`${f}:${child.loc.start.line}: EXPR ${txt}`);
            }
          }
        }
      }
    }
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item && typeof item.type === 'string') visit(item);
        }
      } else if (v && typeof v.type === 'string') {
        visit(v);
      }
    }
  }
  visit(ast);
}

console.log(`--- jsx=${jsxCount} exprChildren=${exprCount} suspicious=${found}`);
