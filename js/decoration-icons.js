/* SVG exports of TLC+ v1.3.0's exact scenery-aware drawDecoSymbol drawings. */
'use strict';
const decorationIconCache = new Map();
function decorationSymbol(type, scenery) {
  if (type === 7 && [1, 2, 4, 5].includes(scenery)) return 'tent';
  return (DECORATION_TYPE_INFO[type] || ['Unknown', 'dot'])[1];
}
function decorationIconURL(type, scenery) {
  return 'assets/decorations/sc' + String(scenery).padStart(2, '0') + '/' + decorationSymbol(type, scenery) + '.svg';
}
function decorationIcon(type, scenery) {
  const url = decorationIconURL(type, scenery);
  if (!decorationIconCache.has(url)) {
    const img = new Image();
    img.onload = () => displayChange();
    img.src = url;
    decorationIconCache.set(url, img);
  }
  return decorationIconCache.get(url);
}
