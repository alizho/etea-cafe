// 24px inline sprite; the img is scaled so the span crops one frame of its sheet
export function spriteIcon(
  src: string,
  imgWidth: string,
  imgHeight: string,
  alt?: string,
  full = false
): string {
  const cls = full ? 'tutorial-sprite tutorial-sprite--full' : 'tutorial-sprite';
  const altAttr = alt === undefined ? '' : ` alt="${alt}"`;
  return (
    `<span class="${cls}" style="width:24px;height:24px">` +
    `<img src="${src}"${altAttr} style="width:${imgWidth};height:${imgHeight}">` +
    `</span>`
  );
}

export const GLORBO_SHEET = '/img/glorbo_sprite_sheet.png';
