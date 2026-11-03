export type RecoveryRequest = { displayName: string; contactEmail: string; details: string };

export function validateRecoveryRequest(request: RecoveryRequest): string | null {
  if (!request.displayName.trim() || request.displayName.trim().length > 80) return 'Enter the name on your player profile (up to 80 characters).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.contactEmail.trim()) || request.contactEmail.trim().length > 254) return 'Enter an email address you can open now.';
  if (request.details.trim().length < 10 || request.details.trim().length > 1000) return 'Add 10–1,000 characters about your crew or usual court. Do not include passwords.';
  return null;
}

export function resetRequestError(message: string): string {
  if (/rate|too many|seconds/i.test(message)) return 'Please wait a minute before requesting another reset link.';
  if (/not authorized|smtp|sending.*email|email.*send/i.test(message)) return 'We could not send a reset email right now. Try again later or open account recovery help.';
  if (/fetch|network/i.test(message)) return 'Check your connection and try again.';
  return 'We could not request a reset link. Try again later or open account recovery help.';
}
