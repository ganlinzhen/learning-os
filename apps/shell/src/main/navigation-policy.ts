export function isTrustedRendererUrl(candidateUrl: string, expectedAppUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl);
    const expected = new URL(expectedAppUrl);

    if (expected.protocol === "file:") {
      return candidate.protocol === "file:" && candidate.pathname === expected.pathname;
    }

    return expected.origin === "http://127.0.0.1:5173" && candidate.origin === expected.origin;
  } catch {
    return false;
  }
}
