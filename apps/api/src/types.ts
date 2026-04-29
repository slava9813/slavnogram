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

export function extractHashtags(value: string) {
  const tags = new Set<string>();
  for (const match of value.matchAll(/#([\p{L}\p{N}_]{2,32})/gu)) {
    tags.add(match[1].toLowerCase());
  }
  return [...tags].slice(0, 12);
}

export function isAdminUsername(username?: string | null) {
  return username === "slavnyj_paren";
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
