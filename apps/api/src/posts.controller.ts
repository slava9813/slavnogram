import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import fs from "node:fs";
import path from "node:path";
import { JwtAuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { apiRoot } from "./config";
import { SqliteService } from "./sqlite.service";
import { moderateContent, RequestWithUser } from "./types";

const uploadsDir = path.join(apiRoot(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

function filename(_req: unknown, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
  const ext = path.extname(file.originalname).toLowerCase() || ".png";
  cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
}

@Controller("posts")
export class PostsController {
  constructor(
    @Inject(SqliteService) private readonly sqlite: SqliteService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get()
  list(@Req() req: any, @Query("communityId") communityId?: string, @Query("userId") userId?: string) {
    const viewer = this.auth.optionalFromHeader(req.headers?.authorization);
    const where: string[] = [];
    const values: number[] = [];
    if (communityId) {
      where.push("p.communityId = ?");
      values.push(Number(communityId));
    }
    if (userId) {
      where.push("p.authorId = ?");
      values.push(Number(userId));
    }

    const rows = this.sqlite.database
      .prepare(
        `SELECT p.*, u.username, u.displayName, u.avatarConfig, u.avatarImage, u.avatarLocked, u.createdAt as authorCreatedAt, c.name as communityName
         FROM posts p
         JOIN users u ON u.id = p.authorId
         LEFT JOIN communities c ON c.id = p.communityId
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY p.id DESC`,
      )
      .all(...values) as any[];

    return rows.map((row) => this.hydratePost(row, viewer?.id));
  }

  @Get("saved")
  @UseGuards(JwtAuthGuard)
  saved(@Req() req: RequestWithUser) {
    const rows = this.sqlite.database
      .prepare(
        `SELECT p.*, u.username, u.displayName, u.avatarConfig, u.avatarImage, u.avatarLocked, u.bio, u.pageConfig, u.createdAt as authorCreatedAt, c.name as communityName
         FROM saved_posts s
         JOIN posts p ON p.id = s.postId
         JOIN users u ON u.id = p.authorId
         LEFT JOIN communities c ON c.id = p.communityId
         WHERE s.userId = ?
         ORDER BY s.createdAt DESC`,
      )
      .all(req.user.id) as any[];
    return rows.map((row) => this.hydratePost(row, req.user.id));
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("photo", {
      storage: diskStorage({ destination: uploadsDir, filename }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        cb(null, /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype));
      },
    }),
  )
  create(@Req() req: RequestWithUser, @Body() body: { text?: string; communityId?: string }, @UploadedFile() file?: Express.Multer.File) {
    const text = (body.text ?? "").trim();
    const communityId = body.communityId ? Number(body.communityId) : null;
    if (!text && !file) throw new BadRequestException("Post needs text or photo");
    const moderationReason = moderateContent(text);
    if (moderationReason) {
      this.logModeration(req.user.id, "post", null, moderationReason, text);
      throw new BadRequestException(moderationReason);
    }

    if (communityId) {
      const community = this.sqlite.database.prepare("SELECT id FROM communities WHERE id = ?").get(communityId);
      if (!community) throw new NotFoundException("Community not found");
    }

    const result = this.sqlite.database
      .prepare("INSERT INTO posts (authorId, communityId, text, photoUrl, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run(req.user.id, communityId, text, file ? `/uploads/${file.filename}` : null, new Date().toISOString());

    const row = this.sqlite.database
      .prepare(
        `SELECT p.*, u.username, u.displayName, u.avatarConfig, u.avatarImage, u.avatarLocked, u.createdAt as authorCreatedAt, c.name as communityName
         FROM posts p
         JOIN users u ON u.id = p.authorId
         LEFT JOIN communities c ON c.id = p.communityId
         WHERE p.id = ?`,
      )
      .get(Number(result.lastInsertRowid)) as any;

    return this.hydratePost(row, req.user.id);
  }

  @Post(":id/like")
  @UseGuards(JwtAuthGuard)
  toggleLike(@Req() req: RequestWithUser, @Param("id") id: string) {
    const postId = Number(id);
    const post = this.sqlite.database.prepare("SELECT id FROM posts WHERE id = ?").get(postId);
    if (!post) throw new NotFoundException("Post not found");

    const exists = this.sqlite.database.prepare("SELECT 1 FROM post_likes WHERE postId = ? AND userId = ?").get(postId, req.user.id);
    if (exists) {
      this.sqlite.database.prepare("DELETE FROM post_likes WHERE postId = ? AND userId = ?").run(postId, req.user.id);
    } else {
      this.sqlite.database.prepare("INSERT INTO post_likes (postId, userId, createdAt) VALUES (?, ?, ?)").run(postId, req.user.id, new Date().toISOString());
    }

    return { liked: !exists, likesCount: this.likeCount(postId) };
  }

  @Post(":id/save")
  @UseGuards(JwtAuthGuard)
  toggleSave(@Req() req: RequestWithUser, @Param("id") id: string) {
    const postId = Number(id);
    const post = this.sqlite.database.prepare("SELECT id FROM posts WHERE id = ?").get(postId);
    if (!post) throw new NotFoundException("Post not found");

    const exists = this.sqlite.database.prepare("SELECT 1 FROM saved_posts WHERE postId = ? AND userId = ?").get(postId, req.user.id);
    if (exists) {
      this.sqlite.database.prepare("DELETE FROM saved_posts WHERE postId = ? AND userId = ?").run(postId, req.user.id);
    } else {
      this.sqlite.database.prepare("INSERT INTO saved_posts (postId, userId, createdAt) VALUES (?, ?, ?)").run(postId, req.user.id, new Date().toISOString());
    }
    return { saved: !exists };
  }

  @Post(":id/comments")
  @UseGuards(JwtAuthGuard)
  addComment(@Req() req: RequestWithUser, @Param("id") id: string, @Body() body: { text?: string }) {
    const postId = Number(id);
    const text = (body.text ?? "").trim();
    if (!text) throw new BadRequestException("Comment text is required");
    const moderationReason = moderateContent(text);
    if (moderationReason) {
      this.logModeration(req.user.id, "comment", postId, moderationReason, text);
      throw new BadRequestException(moderationReason);
    }
    const post = this.sqlite.database.prepare("SELECT id FROM posts WHERE id = ?").get(postId);
    if (!post) throw new NotFoundException("Post not found");

    const result = this.sqlite.database
      .prepare("INSERT INTO comments (postId, userId, text, createdAt) VALUES (?, ?, ?, ?)")
      .run(postId, req.user.id, text, new Date().toISOString());

    return this.commentById(Number(result.lastInsertRowid));
  }

  private hydratePost(row: any, viewerId?: number) {
    return {
      id: Number(row.id),
      text: row.text,
      photoUrl: row.photoUrl,
      communityId: row.communityId ? Number(row.communityId) : null,
      communityName: row.communityName ?? null,
      createdAt: row.createdAt,
      likesCount: this.likeCount(Number(row.id)),
      likedByMe: viewerId
        ? Boolean(this.sqlite.database.prepare("SELECT 1 FROM post_likes WHERE postId = ? AND userId = ?").get(Number(row.id), viewerId))
        : false,
      author: this.auth.publicUser({
        id: row.authorId,
        username: row.username,
        displayName: row.displayName,
        avatarConfig: row.avatarConfig,
        avatarImage: row.avatarImage,
        avatarLocked: row.avatarLocked,
        bio: row.bio,
        pageConfig: row.pageConfig,
        createdAt: row.authorCreatedAt,
      }),
      comments: this.commentsForPost(Number(row.id)),
    };
  }

  private likeCount(postId: number) {
    const row = this.sqlite.database.prepare("SELECT COUNT(*) as count FROM post_likes WHERE postId = ?").get(postId) as any;
    return Number(row.count);
  }

  private commentsForPost(postId: number) {
    const rows = this.sqlite.database
      .prepare(
        `SELECT c.*, u.username, u.displayName, u.avatarConfig, u.avatarImage, u.avatarLocked, u.createdAt as authorCreatedAt
         FROM comments c
         JOIN users u ON u.id = c.userId
         WHERE c.postId = ?
         ORDER BY c.id ASC`,
      )
      .all(postId) as any[];

    return rows.map((row) => ({
      id: Number(row.id),
      text: row.text,
      createdAt: row.createdAt,
      author: this.auth.publicUser({
        id: row.userId,
        username: row.username,
        displayName: row.displayName,
        avatarConfig: row.avatarConfig,
        avatarImage: row.avatarImage,
        avatarLocked: row.avatarLocked,
        bio: row.bio,
        pageConfig: row.pageConfig,
        createdAt: row.authorCreatedAt,
      }),
    }));
  }

  private commentById(id: number) {
    const row = this.sqlite.database
      .prepare(
        `SELECT c.*, u.username, u.displayName, u.avatarConfig, u.avatarImage, u.avatarLocked, u.createdAt as authorCreatedAt
         FROM comments c
         JOIN users u ON u.id = c.userId
         WHERE c.id = ?`,
      )
      .get(id) as any;

    return {
      id: Number(row.id),
      text: row.text,
      createdAt: row.createdAt,
      author: this.auth.publicUser({
        id: row.userId,
        username: row.username,
        displayName: row.displayName,
        avatarConfig: row.avatarConfig,
        avatarImage: row.avatarImage,
        avatarLocked: row.avatarLocked,
        bio: row.bio,
        pageConfig: row.pageConfig,
        createdAt: row.authorCreatedAt,
      }),
    };
  }

  private logModeration(userId: number, targetType: string, targetId: number | null, reason: string, content: string) {
    this.sqlite.database
      .prepare("INSERT INTO moderation_events (userId, targetType, targetId, reason, content, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run(userId, targetType, targetId, reason, content.slice(0, 500), new Date().toISOString());
  }
}
