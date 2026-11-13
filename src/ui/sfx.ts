const HAMMER_SFX_URL = '/audio/hammer.mp3';
const CLICK_SFX_URL = '/audio/click.mp3';

export function playHammerSfx(): void {
  const audio = new Audio(HAMMER_SFX_URL);
  void audio.play().catch((err) => console.error('Hammer SFX failed:', err));
}

export function playClickSound(): void {
  const audio = new Audio(CLICK_SFX_URL);
  audio.play().catch((error) => console.error('Audio play failed:', error));
}
