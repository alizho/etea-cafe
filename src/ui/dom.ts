import { copyTextToClipboard } from './clipboard';

export function setDisplayById(id: string, display: string): void {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

export function showTextOrHide(el: Element | null, text: string | null): void {
  if (!(el instanceof HTMLElement)) return;
  if (text) {
    el.textContent = text;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// swaps in a clone so listeners from earlier calls are dropped
export function replaceWithClone<T extends HTMLElement>(el: T): T {
  const fresh = el.cloneNode(true) as T;
  el.parentNode?.replaceChild(fresh, el);
  return fresh;
}

// a clipboard api failure throws instead of falling back to execCommand
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return copyTextToClipboard(text);
}
