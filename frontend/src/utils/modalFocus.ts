const stack: HTMLElement[] = [];
const inertOwners = new Map<HTMLElement, { count: number; original: boolean }>();
const selector = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** One lifetime per mounted dialog; nested dialogs own focus until they close. */
export function attachModalFocus(panel: HTMLElement, close: () => void, previous = document.activeElement as HTMLElement | null) {
  const doc = panel.ownerDocument;
  const siblings: HTMLElement[] = [];
  let branch: HTMLElement = panel;
  while (branch.parentElement) {
    for (const sibling of Array.from(branch.parentElement.children)) {
      if (sibling === branch || !(sibling instanceof doc.defaultView!.HTMLElement)) continue;
      const state = inertOwners.get(sibling) ?? { count: 0, original: sibling.inert };
      state.count++;
      inertOwners.set(sibling, state);
      sibling.inert = true;
      siblings.push(sibling);
    }
    branch = branch.parentElement;
    if (branch === doc.body) break;
  }
  panel.tabIndex = -1;
  stack.push(panel);
  const isTop = () => stack.at(-1) === panel;
  const candidates = () => Array.from(panel.querySelectorAll<HTMLElement>(selector)).filter((item) => {
    const style = doc.defaultView!.getComputedStyle(item);
    return !item.closest('[hidden], [inert]') && style.display !== 'none' && style.visibility !== 'hidden';
  });
  const focusFirst = () => (candidates()[0] ?? panel).focus();
  const onFocus = (event: FocusEvent) => { if (isTop() && !panel.contains(event.target as Node)) focusFirst(); };
  const onKey = (event: KeyboardEvent) => {
    if (!isTop() || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); close();
    } else if (event.key === 'Tab') {
      const items = candidates();
      const index = items.indexOf(doc.activeElement as HTMLElement);
      if (!items.length || (event.shiftKey ? index <= 0 : index < 0 || index === items.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? items.at(-1) ?? panel : items[0] ?? panel).focus();
      }
    }
  };
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('focusin', onFocus);
  if (!panel.contains(doc.activeElement)) focusFirst();
  return () => {
    const wasTop = isTop();
    stack.splice(stack.indexOf(panel), 1);
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('focusin', onFocus);
    for (const sibling of siblings) {
      const state = inertOwners.get(sibling)!;
      if (--state.count === 0) { sibling.inert = state.original; inertOwners.delete(sibling); }
    }
    if (wasTop && previous?.isConnected) previous.focus();
  };
}
