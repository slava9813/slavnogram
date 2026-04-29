"use client";

export type AvatarConfig = {
  glasses?: string;
  hat?: string;
  wig?: string;
  nose?: string;
};

export type User = {
  id: number;
  username: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  avatarImage?: string | null;
  avatarLocked?: boolean;
  bio?: string;
  pageConfig?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  online?: boolean;
  createdAt: string;
};

export type Comment = {
  id: number;
  text: string;
  createdAt: string;
  author: User;
};

export type Post = {
  id: number;
  text: string;
  photoUrl?: string | null;
  communityId?: number | null;
  communityName?: string | null;
  createdAt: string;
  likesCount: number;
  likedByMe: boolean;
  author: User;
  comments: Comment[];
};

export type Community = {
  id: number;
  name: string;
  description: string;
  membersCount: number;
  joinedByMe: boolean;
  owner: User;
  createdAt: string;
};

export type Message = {
  id: number;
  senderId: number;
  recipientId: number;
  content: string;
  createdAt: string;
  sender: User;
  recipient: User;
};

export type ChatGroup = {
  id: number;
  name: string;
  ownerId: number;
  createdAt: string;
  members: User[];
};

export type GroupMessage = {
  id: number;
  groupId: number;
  senderId: number;
  content: string;
  createdAt: string;
  sender: User;
};

export function apiBase() {
  const configured = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
  if (typeof window === "undefined") return configured;

  const { protocol, hostname, port, origin } = window.location;
  const localNames = new Set(["localhost", "127.0.0.1", "::1"]);

  if (configured.includes("localhost") || configured.includes("127.0.0.1")) {
    if (port === "3000") return `${protocol}//${hostname}:4000`;
    if (!port || port === "4000") return origin;
    if (!localNames.has(hostname)) return `${protocol}//${hostname}:4000`;
  }

  return configured;
}

export function assetUrl(path?: string | null) {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return `${apiBase()}${path}`;
}

export async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || "Request failed");
  }
  return data as T;
}
