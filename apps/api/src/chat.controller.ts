import { Body, BadRequestException, Controller, Get, Inject, NotFoundException, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { ChatGateway } from "./chat.gateway";
import { SqliteService } from "./sqlite.service";
import { RequestWithUser } from "./types";

@Controller("chat")
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    @Inject(SqliteService) private readonly sqlite: SqliteService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ChatGateway) private readonly gateway: ChatGateway,
  ) {}

  @Get(":userId/history")
  history(@Req() req: RequestWithUser, @Param("userId") userId: string) {
    return this.messages(req.user.id, Number(userId));
  }

  @Get("groups/list")
  groups(@Req() req: RequestWithUser) {
    const rows = this.sqlite.database
      .prepare(
        `SELECT g.*
         FROM chat_groups g
         JOIN chat_group_members m ON m.groupId = g.id
         WHERE m.userId = ?
         ORDER BY g.id DESC`,
      )
      .all(req.user.id) as any[];
    return rows.map((row) => this.shapeGroup(row));
  }

  @Post("groups")
  createGroup(@Req() req: RequestWithUser, @Body() body: { name?: string; memberIds?: number[] }) {
    const name = (body.name ?? "").trim();
    const memberIds = [...new Set([req.user.id, ...(Array.isArray(body.memberIds) ? body.memberIds.map(Number) : [])])].filter(Boolean);
    if (name.length < 2 || name.length > 48) throw new BadRequestException("Group name must be 2-48 chars");
    if (memberIds.length < 2) throw new BadRequestException("Choose at least one participant");

    const now = new Date().toISOString();
    const result = this.sqlite.database.prepare("INSERT INTO chat_groups (ownerId, name, createdAt) VALUES (?, ?, ?)").run(req.user.id, name, now);
    const groupId = Number(result.lastInsertRowid);
    const insert = this.sqlite.database.prepare("INSERT INTO chat_group_members (groupId, userId, createdAt) VALUES (?, ?, ?)");
    for (const userId of memberIds) {
      const exists = this.sqlite.database.prepare("SELECT id FROM users WHERE id = ?").get(userId);
      if (exists) insert.run(groupId, userId, now);
    }

    const group = this.shapeGroup(this.sqlite.database.prepare("SELECT * FROM chat_groups WHERE id = ?").get(groupId) as any);
    this.gateway.emitGroupUpdated(group);
    return group;
  }

  @Get("groups/:groupId/history")
  groupHistory(@Req() req: RequestWithUser, @Param("groupId") groupId: string) {
    const id = Number(groupId);
    this.assertGroupMember(id, req.user.id);
    const rows = this.sqlite.database
      .prepare("SELECT * FROM group_messages WHERE groupId = ? ORDER BY id ASC LIMIT 240")
      .all(id) as any[];
    return rows.map((row) => this.shapeGroupMessage(row));
  }

  @Post("groups/:groupId/messages")
  createGroupMessage(@Req() req: RequestWithUser, @Param("groupId") groupId: string, @Body() body: { content?: string }) {
    const id = Number(groupId);
    this.assertGroupMember(id, req.user.id);
    const content = (body.content ?? "").trim();
    if (!content) throw new BadRequestException("Message is empty");
    const message = this.insertGroupMessage(id, req.user.id, content);
    this.gateway.emitGroupMessage(message);
    return message;
  }

  @Post(":userId/messages")
  create(@Req() req: RequestWithUser, @Param("userId") userId: string, @Body() body: { content?: string }) {
    const recipientId = Number(userId);
    const content = (body.content ?? "").trim();
    if (!content) throw new BadRequestException("Message is empty");
    const recipient = this.sqlite.database.prepare("SELECT id FROM users WHERE id = ?").get(recipientId);
    if (!recipient) throw new NotFoundException("User not found");

    const message = this.insertMessage(req.user.id, recipientId, content);
    this.gateway.emitMessage(message);
    return message;
  }

  insertMessage(senderId: number, recipientId: number, content: string) {
    const result = this.sqlite.database
      .prepare("INSERT INTO messages (senderId, recipientId, content, createdAt) VALUES (?, ?, ?, ?)")
      .run(senderId, recipientId, content, new Date().toISOString());

    const row = this.sqlite.database.prepare("SELECT * FROM messages WHERE id = ?").get(Number(result.lastInsertRowid)) as any;
    return this.shape(row);
  }

  insertGroupMessage(groupId: number, senderId: number, content: string) {
    const result = this.sqlite.database
      .prepare("INSERT INTO group_messages (groupId, senderId, content, createdAt) VALUES (?, ?, ?, ?)")
      .run(groupId, senderId, content, new Date().toISOString());
    const row = this.sqlite.database.prepare("SELECT * FROM group_messages WHERE id = ?").get(Number(result.lastInsertRowid)) as any;
    return this.shapeGroupMessage(row);
  }

  messages(a: number, b: number) {
    const rows = this.sqlite.database
      .prepare(
        `SELECT *
         FROM messages
         WHERE (senderId = ? AND recipientId = ?) OR (senderId = ? AND recipientId = ?)
         ORDER BY id ASC
         LIMIT 200`,
      )
      .all(a, b, b, a) as any[];
    return rows.map((row) => this.shape(row));
  }

  private shape(row: any) {
    const sender = this.auth.findUserById(Number(row.senderId));
    const recipient = this.auth.findUserById(Number(row.recipientId));
    return {
      id: Number(row.id),
      senderId: Number(row.senderId),
      recipientId: Number(row.recipientId),
      content: row.content,
      createdAt: row.createdAt,
      sender,
      recipient,
    };
  }

  private assertGroupMember(groupId: number, userId: number) {
    const member = this.sqlite.database.prepare("SELECT 1 FROM chat_group_members WHERE groupId = ? AND userId = ?").get(groupId, userId);
    if (!member) throw new NotFoundException("Group not found");
  }

  private shapeGroup(row: any) {
    const members = this.sqlite.database
      .prepare(
        `SELECT u.*
         FROM chat_group_members m
         JOIN users u ON u.id = m.userId
         WHERE m.groupId = ?
         ORDER BY u.displayName ASC`,
      )
      .all(Number(row.id)) as any[];
    return {
      id: Number(row.id),
      name: row.name,
      ownerId: Number(row.ownerId),
      createdAt: row.createdAt,
      members: members.map((member) => this.auth.publicUser(member)),
    };
  }

  private shapeGroupMessage(row: any) {
    return {
      id: Number(row.id),
      groupId: Number(row.groupId),
      senderId: Number(row.senderId),
      content: row.content,
      createdAt: row.createdAt,
      sender: this.auth.findUserById(Number(row.senderId)),
    };
  }
}
