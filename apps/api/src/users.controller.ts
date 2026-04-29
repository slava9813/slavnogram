import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { PresenceService } from "./presence.service";
import { SqliteService } from "./sqlite.service";
import { AvatarConfig, RequestWithUser } from "./types";

const allowedValues = new Set([
  "",
  "glasses-neon.png",
  "glasses-sun.png",
  "hat-crown.png",
  "hat-cap.png",
  "wig-cyber.png",
  "wig-pink.png",
  "nose-clown.png",
]);

@Controller("users")
export class UsersController {
  constructor(
    @Inject(SqliteService) private readonly sqlite: SqliteService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PresenceService) private readonly presence: PresenceService,
  ) {}

  @Get()
  list(@Req() req?: RequestWithUser) {
    const rows = this.sqlite.database.prepare("SELECT * FROM users ORDER BY displayName ASC").all() as any[];
    return rows
      .map((row) => this.withPresence(row))
      .filter((user) => user.id !== req?.user?.id);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Req() req: RequestWithUser) {
    const row = this.sqlite.database.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id) as any;
    if (!row) throw new NotFoundException("User not found");
    return { ...this.auth.findPrivateUserById(req.user.id), online: this.presence.isOnline(req.user.id) };
  }

  @Patch("me/profile")
  @UseGuards(JwtAuthGuard)
  updateProfile(@Req() req: RequestWithUser, @Body() body: { displayName?: string; bio?: string; pageConfig?: Record<string, unknown> }) {
    const displayName = (body.displayName ?? "").trim();
    const bio = (body.bio ?? "").trim();
    const pageConfig = {
      accent: typeof body.pageConfig?.accent === "string" ? body.pageConfig.accent : "#a86bff",
      status: typeof body.pageConfig?.status === "string" ? body.pageConfig.status.slice(0, 80) : "",
      cover: typeof body.pageConfig?.cover === "string" ? body.pageConfig.cover : "aurora",
    };

    if (displayName.length < 2 || displayName.length > 40) throw new BadRequestException("Display name must be 2-40 chars");
    if (bio.length > 240) throw new BadRequestException("Bio must be up to 240 chars");

    this.sqlite.database
      .prepare("UPDATE users SET displayName = ?, bio = ?, pageConfig = ? WHERE id = ?")
      .run(displayName, bio, JSON.stringify(pageConfig), req.user.id);
    return this.auth.findPrivateUserById(req.user.id);
  }

  @Patch("me/settings")
  @UseGuards(JwtAuthGuard)
  updateSettings(@Req() req: RequestWithUser, @Body() body: Record<string, unknown>) {
    const settings = {
      theme: body.theme === "midnight" ? "midnight" : "neon",
      compactFeed: Boolean(body.compactFeed),
      reduceMotion: Boolean(body.reduceMotion),
      privateProfile: Boolean(body.privateProfile),
      messageRequests: body.messageRequests === "friends" ? "friends" : "everyone",
      callQuality: body.callQuality === "high" ? "high" : "balanced",
      autoModeration: body.autoModeration === false ? false : true,
    };
    this.sqlite.database.prepare("UPDATE users SET settings = ? WHERE id = ?").run(JSON.stringify(settings), req.user.id);
    return this.auth.findPrivateUserById(req.user.id);
  }

  @Patch("me/avatar")
  @UseGuards(JwtAuthGuard)
  updateAvatar(@Req() req: RequestWithUser, @Body() body: AvatarConfig) {
    throw new BadRequestException("Avatar can be created only once during registration");
  }

  @Delete("me")
  @UseGuards(JwtAuthGuard)
  deleteMe(@Req() req: RequestWithUser, @Body() body: { confirm?: string }) {
    if (body.confirm !== "УДАЛИТЬ") {
      throw new ForbiddenException('Type "УДАЛИТЬ" to delete your account');
    }
    this.sqlite.database.prepare("DELETE FROM users WHERE id = ?").run(req.user.id);
    return { ok: true };
  }

  @Get(":id")
  get(@Param("id") id: string) {
    const row = this.sqlite.database.prepare("SELECT * FROM users WHERE id = ?").get(Number(id)) as any;
    if (!row) throw new NotFoundException("User not found");
    return this.withPresence(row);
  }

  private withPresence(row: any) {
    return {
      ...this.auth.publicUser(row),
      online: this.presence.isOnline(Number(row.id)),
    };
  }
}
