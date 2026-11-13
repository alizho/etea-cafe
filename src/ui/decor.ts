const ANIMATION_PAIRS: [string, string][] = Array.from({ length: 12 }, (_, i) => [
  `/img/bg${i + 1}-1.png`,
  `/img/bg${i + 1}-2.png`,
]);

export function scatterDecorations(): void {
  const count: number = 30;
  const container: HTMLElement = document.body;

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const cellWidth = 100 / cols;
  const cellHeight = 100 / rows;

  for (let i = 0; i < count; i++) {
    const deco = document.createElement('img');

    const randomPair = ANIMATION_PAIRS[Math.floor(Math.random() * ANIMATION_PAIRS.length)];
    deco.src = randomPair[0];

    const col = i % cols;
    const row = Math.floor(i / cols);

    const jitterX = Math.random();
    const jitterY = Math.random();

    deco.style.position = 'fixed';
    deco.style.left = `${(col + jitterX) * cellWidth}%`;
    deco.style.top = `${(row + jitterY) * cellHeight}%`;
    deco.style.width = '48px';
    deco.style.pointerEvents = 'none';
    deco.style.zIndex = '0';
    deco.style.imageRendering = '-webkit-optimize-contrast';
    deco.style.imageRendering = 'crisp-edges';
    deco.style.imageRendering = 'pixelated';

    container.appendChild(deco);

    let currentFrame = 0;
    setInterval(() => {
      currentFrame = (currentFrame + 1) % 2;
      deco.src = randomPair[currentFrame];
    }, 500);
  }
}
