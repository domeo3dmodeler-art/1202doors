/**
 * DomeoDoors_Diamond_1 → DomeoDoors Diamond 1
 * Replaces underscores with spaces for UI display.
 */
export function formatModelName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '';
  return name.replace(/_/g, ' ').trim();
}
