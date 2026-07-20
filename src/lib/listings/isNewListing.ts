const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function isNewListing(extractedAt: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(extractedAt).getTime() < NEW_WINDOW_MS;
}
