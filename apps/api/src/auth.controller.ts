import { Body, Controller, Get, Inject, Post, Req, UseGuards, BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./auth.guard";
import { SqliteService } from "./sqlite.service";
import { RequestWithUser } from "./types";
import { isAvatarDataUrl, isAdminUsername } from "./types";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(SqliteService) private readonly sqlite: SqliteService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Post("register")
  register(@Body() body: { username?: string; displayName?: string; password?: string; avatarImage?: string }) {
    const username = (body.username ?? "").trim().toLowerCase();
    const displayName = (body.displayName ?? body.username ?? "").trim();
    const password = body.password ?? "";

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      throw new BadRequestException("Username must be 3-24 chars: a-z, 0-9, underscore");
    }
    if (displayName.length < 2 || displayName.length > 40) {
      throw new BadRequestException("Display name must be 2-40 chars");
    }
    if (password.length < 6) {
      throw new BadRequestException("Password must be at least 6 chars");
    }
    const avatarImage = body.avatarImage;
    if (!isAvatarDataUrl(avatarImage)) {
      throw new BadRequestException("Draw your avatar during registration. Avatar can be created only once.");
    }

    const exists = this.sqlite.database.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (exists) throw new ConflictException("Username is taken");

    const now = new Date().toISOString();
    const result = this.sqlite.database
      .prepare("INSERT INTO users (username, displayName, passwordHash, avatarConfig, avatarImage, avatarLocked, role, settings, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(username, displayName, this.auth.hashPassword(password), "{}", avatarImage, 1, isAdminUsername(username) ? "admin" : "user", JSON.stringify({ topics: [] }), now);

    const user = this.auth.findUserById(Number(result.lastInsertRowid));
    return { token: this.auth.sign({ id: user!.id, username: user!.username }), user };
  }

  @Post("login")
  login(@Body() body: { username?: string; password?: string }) {
    const username = (body.username ?? "").trim().toLowerCase();
    const row = this.sqlite.database.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
    if (!row || !this.auth.comparePassword(body.password ?? "", row.passwordHash)) {
      throw new UnauthorizedException("Wrong username or password");
    }
    if (row.blocked) throw new UnauthorizedException("Account is blocked");

    const user = this.auth.publicUser(row);
    return { token: this.auth.sign(user), user };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Req() req: RequestWithUser) {
    const user = this.auth.findPrivateUserById(req.user.id);
    if (!user) throw new UnauthorizedException("User not found");
    return user;
  }
}
