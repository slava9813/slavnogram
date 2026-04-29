import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { ChatGateway } from "./chat.gateway";
import { PostsController } from "./posts.controller";
import { SqliteService } from "./sqlite.service";
import { RequestWithUser } from "./types";

@Controller("communities")
export class CommunitiesController {
  constructor(
    @Inject(SqliteService) private readonly sqlite: SqliteService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PostsController) private readonly posts: PostsController,
    @Inject(ChatGateway) private readonly gateway: ChatGateway,
  ) {}

  @Get()
  list(@Req() req: any) {
    const viewer = this.auth.optionalFromHeader(req.headers?.authorization);
    const rows = this.sqlite.database
      .prepare(
        `SELECT c.*, u.username, u.displayName, u.avatarConfig, u.avatarImage, u.avatarLocked, u.createdAt as ownerCreatedAt
         FROM communities c
         JOIN users u ON u.id = c.ownerId
         ORDER BY c.id DESC`,
      )
      .all() as any[];

    return rows.map((row) => this.shape(row, viewer?.id));
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: RequestWithUser, @Body() body: { name?: string; description?: string }) {
    const name = (body.name ?? "").trim();
    const description = (body.description ?? "").trim();
    if (name.length < 3 || name.length > 60) throw new BadRequestException("Community name must be 3-60 chars");

    const now = new Date().toISOString();
    const result = this.sqlite.database
      .prepare("INSERT INTO communities (ownerId, name, description, createdAt) VALUES (?, ?, ?, ?)")
      .run(req.user.id, name, description, now);
    this.sqlite.database
      .prepare("INSERT INTO community_members (communityId, userId, createdAt) VALUES (?, ?, ?)")
      .run(Number(result.lastInsertRowid), req.user.id, now);

    const row = this.communityRow(Number(result.lastInsertRowid));
    return this.shape(row, req.user.id);
  }

  @Get(":id")
  get(@Req() req: any, @Param("id") id: string) {
    const viewer = this.auth.optionalFromHeader(req.headers?.authorization);
    const row = this.communityRow(Number(id));
    if (!row) throw new NotFoundException("Community not found");
    return this.shape(row, viewer?.id);
  }

  @Post(":id/subscribe")
  @UseGuards(JwtAuthGuard)
  subscribe(@Req() req: RequestWithUser, @Param("id") id: string) {
    const communityId = Number(id);
    const row = this.communityRow(communityId);
    if (!row) throw new NotFoundException("Community not found");

    const exists = this.sqlite.database.prepare("SELECT 1 FROM community_members WHERE communityId = ? AND userId = ?").get(communityId, req.user.id);
    if (exists) {
      this.sqlite.database.prepare("DELETE FROM community_members WHERE communityId = ? AND userId = ?").run(communityId, req.user.id);
    } else {
      this.sqlite.database.prepare("INSERT INTO community_members (communityId, userId, createdAt) VALUES (?, ?, ?)").run(communityId, req.user.id, new Date().toISOString());
      this.gateway.createNotification({
        userId: Number(row.ownerId),
        type: "community_subscribe",
        title: "New subscriber",
        body: `Someone subscribed to ${row.name}`,
        actorId: req.user.id,
        targetType: "community",
        targetId: communityId,
      });
    }

    return this.shape(this.communityRow(communityId), req.user.id);
  }

  @Post(":id/posts")
  @UseGuards(JwtAuthGuard)
  createPost(@Req() req: RequestWithUser, @Param("id") id: string, @Body() body: { text?: string }) {
    const communityId = Number(id);
    const row = this.communityRow(communityId);
    if (!row) throw new NotFoundException("Community not found");
    return this.posts.create(req, { text: body.text, communityId: String(communityId) });
  }

  private communityRow(id: number) {
    return this.sqlite.database
      .prepare(
        `SELECT c.*, u.username, u.displayName, u.avatarConfig, u.avatarImage, u.avatarLocked, u.createdAt as ownerCreatedAt
         FROM communities c
         JOIN users u ON u.id = c.ownerId
         WHERE c.id = ?`,
      )
      .get(id) as any;
  }

  private shape(row: any, viewerId?: number) {
    const members = this.sqlite.database.prepare("SELECT COUNT(*) as count FROM community_members WHERE communityId = ?").get(Number(row.id)) as any;
    const joined = viewerId
      ? this.sqlite.database.prepare("SELECT 1 FROM community_members WHERE communityId = ? AND userId = ?").get(Number(row.id), viewerId)
      : null;
    return {
      id: Number(row.id),
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      membersCount: Number(members.count),
      joinedByMe: Boolean(joined),
      owner: this.auth.publicUser({
        id: row.ownerId,
        username: row.username,
        displayName: row.displayName,
        avatarConfig: row.avatarConfig,
        avatarImage: row.avatarImage,
        avatarLocked: row.avatarLocked,
        createdAt: row.ownerCreatedAt,
      }),
    };
  }
}
