import { Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { SqliteService } from "./sqlite.service";
import { RequestWithUser } from "./types";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    @Inject(SqliteService) private readonly sqlite: SqliteService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get()
  list(@Req() req: RequestWithUser) {
    const rows = this.sqlite.database
      .prepare(
        `SELECT n.*, u.username, u.displayName, u.avatarConfig, u.avatarImage, u.avatarLocked, u.bio, u.pageConfig, u.createdAt as actorCreatedAt
         FROM notifications n
         LEFT JOIN users u ON u.id = n.actorId
         WHERE n.userId = ?
         ORDER BY n.id DESC
         LIMIT 80`,
      )
      .all(req.user.id) as any[];
    return rows.map((row) => this.shape(row));
  }

  @Post(":id/read")
  read(@Req() req: RequestWithUser, @Param("id") id: string) {
    this.sqlite.database.prepare("UPDATE notifications SET readAt = ? WHERE id = ? AND userId = ?").run(new Date().toISOString(), Number(id), req.user.id);
    return { ok: true };
  }

  @Post("read-all")
  readAll(@Req() req: RequestWithUser) {
    this.sqlite.database.prepare("UPDATE notifications SET readAt = ? WHERE userId = ? AND readAt IS NULL").run(new Date().toISOString(), req.user.id);
    return { ok: true };
  }

  private shape(row: any) {
    return {
      id: Number(row.id),
      userId: Number(row.userId),
      type: row.type,
      title: row.title,
      body: row.body,
      targetType: row.targetType,
      targetId: row.targetId ? Number(row.targetId) : null,
      readAt: row.readAt,
      createdAt: row.createdAt,
      actor: row.actorId
        ? this.auth.publicUser({
            id: row.actorId,
            username: row.username,
            displayName: row.displayName,
            avatarConfig: row.avatarConfig,
            avatarImage: row.avatarImage,
            avatarLocked: row.avatarLocked,
            bio: row.bio,
            pageConfig: row.pageConfig,
            createdAt: row.actorCreatedAt,
          })
        : null,
    };
  }
}
