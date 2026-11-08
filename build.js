// Bundles src/ into one self-contained dist/plain.html (CDN libs + Google Fonts stay external).
const fs = require('fs');
const path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const js = ['model.js', 'parser.js', 'app.js'].map(src).join('\n;\n');
if (/<\/script/i.test(js)) throw new Error('Inline JS contains a closing script tag');
const html = src('index.html')
  .replace('/*__CSS__*/', () => src('styles.css'))
  .replace('/*__JS__*/', () => js);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'plain.html'), html);
console.log(`dist/plain.html  ${(html.length / 1024).toFixed(1)} KB`);
