import API_URL from "../config";

export interface EnrollResponse {
  qr_uri: string;
  secret_preview: string;
  backup_codes: string[];
}

export class MfaApiError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

async function parseError(response: Response): Promise<never> {
  const data = await response.json().catch(() => ({}));
  throw new MfaApiError(data?.detail || "mfa_request_failed", response.status);
}

export async function enrollMfa(): Promise<EnrollResponse> {
  const response = await fetch(`${API_URL}/api/mfa/enroll`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) await parseError(response);
  return response.json();
}

export async function confirmMfa(otp: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/mfa/confirm`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ otp: otp.trim() }),
  });
  if (!response.ok) await parseError(response);
}

export async function disableMyMfa(): Promise<void> {
  const response = await fetch(`${API_URL}/api/mfa/me`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) await parseError(response);
}
