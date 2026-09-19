const fs = require('fs');
const path = require('path');

const cssPath = path.join('site', 'src', 'styles', 'landing.css');
let css = fs.readFileSync(cssPath, 'utf-8');

// 1. Fix overlap: add z-index to feature-card-text
css = css.replace('.feature-card {', '.feature-card-text { position: relative; z-index: 10; pointer-events: none; }\n.feature-card {');

// 2. Fix layout: 2x2 grid
css = css.replace('grid-template-columns: repeat(3, minmax(0, 1fr));', 'grid-template-columns: repeat(2, minmax(0, 1fr));');
css = css.replace(/\.feature-card-0 \{[\s\S]*?grid-row: span 2;\n\}/g, '');
css = css.replace(/\.feature-card-1 \{[\s\S]*?grid-row: span 1;\n\}/g, '');
css = css.replace(/\.feature-card-2 \{[\s\S]*?grid-row: span 1;\n\}/g, '');
css = css.replace(/\.feature-card-3 \{[\s\S]*?grid-row: span 1;\n\}/g, '');
css = css.replace(/\.feature-card-0, \.feature-card-1, \.feature-card-2 \{[\s\S]*?grid-row: span 1;\n  \}/g, '');
css = css.replace(/\.feature-card-3 \{[\s\S]*?grid-column: span 2;\n  \}/g, '');

fs.writeFileSync(cssPath, css);

const tsxPath = path.join('site', 'src', 'routes', 'index.tsx');
let tsx = fs.readFileSync(tsxPath, 'utf-8');

// 3. Change FeatureGraphic3 animation
const oldGraphic3 = `function FeatureGraphic3() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-14 h-8 rounded-full p-1 relative shadow-inner transition-colors duration-[1.5s]" style={{ animation: 'toggle-bg-subtle 4s infinite' }}>
        <div className="w-6 h-6 bg-white rounded-full shadow-sm" style={{ animation: 'toggle-flip-subtle 4s cubic-bezier(0.4, 0, 0.2, 1) infinite' }} />
      </div>
    </div>
  );
}`;
const newGraphic3 = `function FeatureGraphic3() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative flex items-center justify-center">
        <Settings size={48} className="text-[#38b889]/60 absolute" style={{ animation: 'spin 4s linear infinite reverse' }} />
        <Settings size={24} className="text-[#38b889] z-10 bg-[#fcfcfb] rounded-full" style={{ animation: 'spin 3s linear infinite' }} />
      </div>
    </div>
  );
}`;
tsx = tsx.replace(oldGraphic3, newGraphic3);

// Also remove the specific feature-card-X classes in tsx if needed, but it's fine to leave them since they don't do anything in CSS now.

fs.writeFileSync(tsxPath, tsx);

console.log('done');
