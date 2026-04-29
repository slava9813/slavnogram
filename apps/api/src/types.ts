export type AvatarConfig = {
  glasses?: string;
  hat?: string;
  wig?: string;
  nose?: string;
};

export function isAvatarDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(value) && value.length < 900_000;
}

const blockedWords = ["spam", "drug", "casino", "scam", "fraud", "malware", "phishing", "bet"];

export function moderateContent(value: string) {
  const text = value.toLowerCase();
  const hit = blockedWords.find((word) => text.includes(word));
  return hit ? `Auto moderation blocked forbidden fragment "${hit}"` : null;
}

export type AuthUser = {
  id: number;
  username: string;
};

export type RequestWithUser = {
  user: AuthUser;
};

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
