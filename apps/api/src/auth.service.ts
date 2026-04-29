import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "./config";
import { SqliteService } from "./sqlite.service";
import { parseJson, AvatarConfig } from "./types";

export type PublicUser = {
  id: number;
  username: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  avatarImage: string | null;
  avatarLocked: boolean;
  bio: string;
  pageConfig: Record<string, unknown>;
  settings?: Record<string, unknown>;
  createdAt: string;
};

@Injectable()
export class AuthService {
  constructor(@Inject(SqliteService) private readonly sqlite: SqliteService) {}

  hashPassword(password: string) {
    return bcrypt.hashSync(password, 10);
  }

  comparePassword(password: string, hash: string) {
    return bcrypt.compareSync(password, hash);
  }

  sign(user: { id: number; username: string }) {
    return jwt.sign({ sub: user.id, username: user.username }, env("JWT_SECRET", "dev_secret"), {
      expiresIn: "7d",
    });
  }

  verify(token: string) {
    try {
      const payload = jwt.verify(token, env("JWT_SECRET", "dev_secret")) as jwt.JwtPayload;
      if (!payload.sub || !payload.username) throw new UnauthorizedException("Invalid token");
      return { id: Number(payload.sub), username: String(payload.username) };
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }

  optionalFromHeader(header?: string) {
    if (!header?.startsWith("Bearer ")) return null;
    try {
      return this.verify(header.slice("Bearer ".length));
    } catch {
      return null;
    }
  }

  publicUser(row: any): PublicUser {
    return {
      id: Number(row.id),
      username: row.username,
      displayName: row.displayName,
      avatarConfig: parseJson<AvatarConfig>(row.avatarConfig, {}),
      avatarImage: row.avatarImage ?? null,
      avatarLocked: Boolean(row.avatarLocked ?? 1),
      bio: row.bio ?? "",
      pageConfig: parseJson<Record<string, unknown>>(row.pageConfig, {}),
      createdAt: row.createdAt,
    };
  }

  privateUser(row: any): PublicUser {
    return {
      ...this.publicUser(row),
      settings: parseJson<Record<string, unknown>>(row.settings, {}),
    };
  }

  findUserById(id: number) {
    const row = this.sqlite.database.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    return row ? this.publicUser(row) : null;
  }

  findPrivateUserById(id: number) {
    const row = this.sqlite.database.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    return row ? this.privateUser(row) : null;
  }
}
