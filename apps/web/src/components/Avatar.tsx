"use client";

import type { User } from "@/lib/api";

type Props = {
  user?: Pick<User, "displayName" | "username" | "avatarImage"> | null;
  config?: unknown;
  size?: "sm" | "md" | "lg";
  glow?: boolean;
  onClick?: () => void;
};

const sizes = {
  sm: 44,
  md: 64,
  lg: 148,
} as const;

export function Avatar({ user, size = "md", glow = false, onClick }: Props) {
  const px = sizes[size];
  const name = user?.displayName || user?.username || "Гость";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const content = user?.avatarImage ? <img alt="" src={user.avatarImage} className="avatar-layer" draggable={false} /> : <span>{initials || "С"}</span>;

  if (onClick) {
    return (
      <button
        className={`avatar avatar-${size} ${glow ? "avatar-glow" : ""} avatar-clickable`}
        style={{ width: px, height: px }}
        onClick={onClick}
        type="button"
        aria-label={name}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`avatar avatar-${size} ${glow ? "avatar-glow" : ""}`} style={{ width: px, height: px }} aria-label={name}>
      {content}
    </div>
  );
}
