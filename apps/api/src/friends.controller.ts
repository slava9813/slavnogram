import { Controller, Delete, Get, Inject, NotFoundException, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { PresenceService } from "./presence.service";
import { SqliteService } from "./sqlite.service";
import { RequestWithUser } from "./types";

@Controller("friends")
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(
    @Inject(SqliteService) private readonly sqlite: SqliteService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PresenceService) private readonly presence: PresenceService,
  ) {}

  @Get()
  list(@Req() req: RequestWithUser) {
    const rows = this.sqlite.database
      .prepare(
        `SELECT u.*
         FROM friends f
         JOIN users u ON u.id = CASE WHEN f.userId = ? THEN f.friendId ELSE f.userId END
         WHERE (f.userId = ? OR f.friendId = ?) AND f.status = 'accepted'
         ORDER BY u.displayName ASC`,
      )
      .all(req.user.id, req.user.id, req.user.id) as any[];

    return rows.map((row) => ({ ...this.auth.publicUser(row), online: this.presence.isOnline(Number(row.id)) }));
  }

  @Post(":id")
  add(@Req() req: RequestWithUser, @Param("id") id: string) {
    const otherId = Number(id);
    if (otherId === req.user.id) throw new NotFoundException("Choose another user");
    const other = this.sqlite.database.prepare("SELECT id FROM users WHERE id = ?").get(otherId);
    if (!other) throw new NotFoundException("User not found");

    const a = Math.min(req.user.id, otherId);
    const b = Math.max(req.user.id, otherId);
    this.sqlite.database
      .prepare("INSERT OR IGNORE INTO friends (userId, friendId, status, createdAt) VALUES (?, ?, 'accepted', ?)")
      .run(a, b, new Date().toISOString());

    return this.list(req);
  }

  @Delete(":id")
  remove(@Req() req: RequestWithUser, @Param("id") id: string) {
    const otherId = Number(id);
    const a = Math.min(req.user.id, otherId);
    const b = Math.max(req.user.id, otherId);
    this.sqlite.database.prepare("DELETE FROM friends WHERE userId = ? AND friendId = ?").run(a, b);
    return { ok: true };
  }
}
