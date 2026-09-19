const fs = require('fs');
const path = require('path');

const filePath = path.join('site', 'src', 'components', 'CofounderGraphic.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Reduce central logo size from w-[300px] h-[300px] to w-[200px] h-[200px]
content = content.replace(/w-\[300px\] h-\[300px\]/g, 'w-[200px] h-[200px]');

// Remove card styles
const cardStyleToReplace = 'width: "70px", padding: "11.944px 10.287px", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "8.287px", borderRadius: "6.629px", background: "#FBFBF8", boxShadow: "0 0 0 0.829px #FFF inset, 0 0 0 0.829px rgba(0, 0, 0, 0.08), 0 4px 12px 0 rgba(0, 0, 0, 0.06)", boxSizing: "border-box", color: "rgba(32, 32, 32, 0.60)", textAlign: "center", fontFamily: "var(--font-neoris), sans-serif", fontSize: "11px", fontWeight: 400, lineHeight: "120%", whiteSpace: "nowrap"';
const cardStyleReplacement = 'flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "8.287px", color: "rgba(32, 32, 32, 0.60)", textAlign: "center", fontFamily: "var(--font-neoris), sans-serif", fontSize: "11px", fontWeight: 400, lineHeight: "120%", whiteSpace: "nowrap"';

content = content.replaceAll(cardStyleToReplace, cardStyleReplacement);

fs.writeFileSync(filePath, content);
console.log('Done!');
