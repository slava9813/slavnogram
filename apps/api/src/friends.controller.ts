import { BadRequestException, Controller, Delete, Get, Inject, NotFoundException, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { ChatGateway } from "./chat.gateway";
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
    @Inject(ChatGateway) private readonly gateway: ChatGateway,
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

  @Get("requests/incoming")
  requests(@Req() req: RequestWithUser) {
    const rows = this.sqlite.database
      .prepare(
        `SELECT u.*
         FROM friends f
         JOIN users u ON u.id = f.requesterId
         WHERE f.status = 'pending'
           AND f.requesterId <> ?
           AND (f.userId = ? OR f.friendId = ?)
         ORDER BY f.id DESC`,
      )
      .all(req.user.id, req.user.id, req.user.id) as any[];
    return rows.map((row) => ({ ...this.auth.publicUser(row), online: this.presence.isOnline(Number(row.id)) }));
  }

  @Get("requests/outgoing")
  outgoing(@Req() req: RequestWithUser) {
    const rows = this.sqlite.database
      .prepare(
        `SELECT u.*
         FROM friends f
         JOIN users u ON u.id = CASE WHEN f.userId = ? THEN f.friendId ELSE f.userId END
         WHERE f.status = 'pending'
           AND f.requesterId = ?
         ORDER BY f.id DESC`,
      )
      .all(req.user.id, req.user.id) as any[];
    return rows.map((row) => ({ ...this.auth.publicUser(row), online: this.presence.isOnline(Number(row.id)) }));
  }

  @Post(":id")
  add(@Req() req: RequestWithUser, @Param("id") id: string) {
    const otherId = Number(id);
    if (otherId === req.user.id) throw new BadRequestException("You cannot add yourself");
    const other = this.sqlite.database.prepare("SELECT id FROM users WHERE id = ?").get(otherId);
    if (!other) throw new NotFoundException("User not found");

    const a = Math.min(req.user.id, otherId);
    const b = Math.max(req.user.id, otherId);
    const existing = this.sqlite.database.prepare("SELECT * FROM friends WHERE userId = ? AND friendId = ?").get(a, b) as any;

    if (existing?.status === "accepted") return this.list(req);
    if (existing?.status === "pending" && Number(existing.requesterId) !== req.user.id) {
      this.sqlite.database.prepare("UPDATE friends SET status = 'accepted' WHERE userId = ? AND friendId = ?").run(a, b);
      this.gateway.createNotification({
        userId: Number(existing.requesterId),
        type: "friend_accept",
        title: "Friend request accepted",
        body: "Your friend request was accepted",
        actorId: req.user.id,
        targetType: "user",
        targetId: req.user.id,
      });
      return this.list(req);
    }

    this.sqlite.database
      .prepare("INSERT OR REPLACE INTO friends (userId, friendId, status, requesterId, createdAt) VALUES (?, ?, 'pending', ?, ?)")
      .run(a, b, req.user.id, new Date().toISOString());

    this.gateway.createNotification({
      userId: otherId,
      type: "friend_request",
      title: "New friend request",
      body: "Someone wants to add you as a friend",
      actorId: req.user.id,
      targetType: "user",
      targetId: req.user.id,
    });

    return this.list(req);
  }

  @Post(":id/accept")
  accept(@Req() req: RequestWithUser, @Param("id") id: string) {
    const otherId = Number(id);
    const a = Math.min(req.user.id, otherId);
    const b = Math.max(req.user.id, otherId);
    const row = this.sqlite.database.prepare("SELECT * FROM friends WHERE userId = ? AND friendId = ? AND status = 'pending'").get(a, b) as any;
    if (!row || Number(row.requesterId) === req.user.id) throw new NotFoundException("Friend request not found");
    this.sqlite.database.prepare("UPDATE friends SET status = 'accepted' WHERE userId = ? AND friendId = ?").run(a, b);
    this.gateway.createNotification({
      userId: otherId,
      type: "friend_accept",
      title: "Friend request accepted",
      body: "Your friend request was accepted",
      actorId: req.user.id,
      targetType: "user",
      targetId: req.user.id,
    });
    return this.list(req);
  }

  @Post(":id/decline")
  decline(@Req() req: RequestWithUser, @Param("id") id: string) {
    const otherId = Number(id);
    const a = Math.min(req.user.id, otherId);
    const b = Math.max(req.user.id, otherId);
    this.sqlite.database.prepare("DELETE FROM friends WHERE userId = ? AND friendId = ? AND status = 'pending' AND requesterId <> ?").run(a, b, req.user.id);
    return { ok: true };
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
