// Run fn once the DOM is ready (no ClientRouter: no page-load events).
export function onPageInit(fn: () => void): void {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}
