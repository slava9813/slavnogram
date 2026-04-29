import { Controller, Delete, Get, Inject, Param, Post, Req, UseGuards, ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtAuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { PresenceService } from "./presence.service";
import { SqliteService } from "./sqlite.service";
import { isAdminUsername, RequestWithUser } from "./types";

@Controller("admin")
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    @Inject(SqliteService) private readonly sqlite: SqliteService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PresenceService) private readonly presence: PresenceService,
  ) {}

  @Get("users")
  users(@Req() req: RequestWithUser) {
    this.assertAdmin(req.user.id);
    const rows = this.sqlite.database.prepare("SELECT * FROM users ORDER BY id DESC").all() as any[];
    return rows.map((row) => ({
      ...this.auth.publicUser(row),
      online: this.presence.isOnline(Number(row.id)),
      postsCount: this.count("posts", "authorId", Number(row.id)),
      friendsCount: this.friendCount(Number(row.id)),
    }));
  }

  @Post("users/:id/block")
  block(@Req() req: RequestWithUser, @Param("id") id: string) {
    this.assertAdmin(req.user.id);
    const userId = Number(id);
    this.assertUser(userId);
    if (userId === req.user.id) throw new ForbiddenException("Admin cannot block himself");
    const row = this.sqlite.database.prepare("SELECT blocked FROM users WHERE id = ?").get(userId) as any;
    const blocked = row.blocked ? 0 : 1;
    this.sqlite.database.prepare("UPDATE users SET blocked = ? WHERE id = ?").run(blocked, userId);
    return { blocked: Boolean(blocked) };
  }

  @Delete("users/:id")
  removeUser(@Req() req: RequestWithUser, @Param("id") id: string) {
    this.assertAdmin(req.user.id);
    const userId = Number(id);
    this.assertUser(userId);
    if (userId === req.user.id) throw new ForbiddenException("Admin cannot delete himself");
    this.sqlite.database.prepare("DELETE FROM users WHERE id = ?").run(userId);
    return { ok: true };
  }

  @Delete("posts/:id")
  removePost(@Req() req: RequestWithUser, @Param("id") id: string) {
    this.assertAdmin(req.user.id);
    this.sqlite.database.prepare("DELETE FROM posts WHERE id = ?").run(Number(id));
    return { ok: true };
  }

  private assertAdmin(userId: number) {
    const user = this.sqlite.database.prepare("SELECT username, role FROM users WHERE id = ?").get(userId) as any;
    if (!user || (!isAdminUsername(user.username) && user.role !== "admin")) {
      throw new ForbiddenException("Admin only");
    }
  }

  private assertUser(userId: number) {
    const user = this.sqlite.database.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!user) throw new NotFoundException("User not found");
  }

  private count(table: string, field: string, id: number) {
    const row = this.sqlite.database.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE ${field} = ?`).get(id) as any;
    return Number(row.count);
  }

  private friendCount(id: number) {
    const row = this.sqlite.database
      .prepare("SELECT COUNT(*) as count FROM friends WHERE status = 'accepted' AND (userId = ? OR friendId = ?)")
      .get(id, id) as any;
    return Number(row.count);
  }
}
