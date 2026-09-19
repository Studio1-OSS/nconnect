const fs = require('fs');
const path = require('path');

const cssPath = path.join('site', 'src', 'styles', 'landing.css');
let buffer = fs.readFileSync(cssPath);

// The file was likely encoded in utf-8, then powershell appended utf-16le bytes.
// We can just read the text, remove any null bytes, and remove the weird keyframes spin line.

let text = buffer.toString('utf-8');
text = text.replace(/\0/g, '');
text = text.replace(/@keyframes spin \{ 100% \{ transform: rotate\(360deg\); \} \}/g, '');
text = text.trim();
text += '\n\n@keyframes spin { 100% { transform: rotate(360deg); } }\n';

fs.writeFileSync(cssPath, text);
console.log('Fixed CSS');
