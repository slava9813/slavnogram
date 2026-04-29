import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Inject } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { AuthService } from "./auth.service";
import { PresenceService } from "./presence.service";
import { SqliteService } from "./sqlite.service";

type AuthedSocket = Socket & { userId?: number };

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PresenceService) private readonly presence: PresenceService,
    @Inject(SqliteService) private readonly sqlite: SqliteService,
  ) {}

  handleConnection(socket: AuthedSocket) {
    const token = String(socket.handshake.auth?.token ?? "");
    try {
      const user = this.auth.verify(token);
      socket.userId = user.id;
      socket.join(this.room(user.id));
      const groups = this.sqlite.database.prepare("SELECT groupId FROM chat_group_members WHERE userId = ?").all(user.id) as any[];
      for (const group of groups) socket.join(this.groupRoom(Number(group.groupId)));
      this.presence.markOnline(user.id, socket.id);
      this.broadcastPresence();
    } catch {
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: AuthedSocket) {
    if (!socket.userId) return;
    this.presence.markOffline(socket.userId, socket.id);
    this.broadcastPresence();
  }

  @SubscribeMessage("chat:send")
  send(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { toUserId?: number; content?: string }) {
    if (!socket.userId) return;
    const recipientId = Number(body.toUserId);
    const content = String(body.content ?? "").trim();
    if (!recipientId || !content) return;

    const recipient = this.sqlite.database.prepare("SELECT id FROM users WHERE id = ?").get(recipientId);
    if (!recipient) return;

    const result = this.sqlite.database
      .prepare("INSERT INTO messages (senderId, recipientId, content, createdAt) VALUES (?, ?, ?, ?)")
      .run(socket.userId, recipientId, content, new Date().toISOString());
    const row = this.sqlite.database.prepare("SELECT * FROM messages WHERE id = ?").get(Number(result.lastInsertRowid)) as any;
    const message = this.shapeMessage(row);
    this.emitMessage(message);
    this.createNotification({
      userId: recipientId,
      type: "message",
      title: `${message.sender?.displayName ?? "Someone"} sent a message`,
      body: content,
      actorId: socket.userId,
      targetType: "chat",
      targetId: socket.userId,
    });
  }

  @SubscribeMessage("chat:group-send")
  groupSend(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { groupId?: number; content?: string }) {
    if (!socket.userId) return;
    const groupId = Number(body.groupId);
    const content = String(body.content ?? "").trim();
    if (!groupId || !content) return;
    const member = this.sqlite.database.prepare("SELECT 1 FROM chat_group_members WHERE groupId = ? AND userId = ?").get(groupId, socket.userId);
    if (!member) return;
    const result = this.sqlite.database
      .prepare("INSERT INTO group_messages (groupId, senderId, content, createdAt) VALUES (?, ?, ?, ?)")
      .run(groupId, socket.userId, content, new Date().toISOString());
    const row = this.sqlite.database.prepare("SELECT * FROM group_messages WHERE id = ?").get(Number(result.lastInsertRowid)) as any;
    const message = this.shapeGroupMessage(row);
    this.emitGroupMessage(message);
    const members = this.sqlite.database.prepare("SELECT userId FROM chat_group_members WHERE groupId = ? AND userId <> ?").all(groupId, socket.userId) as any[];
    for (const member of members) {
      this.createNotification({
        userId: Number(member.userId),
        type: "message",
        title: `${message.sender?.displayName ?? "Someone"} wrote in a group`,
        body: content,
        actorId: socket.userId,
        targetType: "group",
        targetId: groupId,
      });
    }
  }

  @SubscribeMessage("call:join")
  joinCall(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { roomId?: string; label?: string }) {
    if (!socket.userId || !body.roomId) return;
    const roomId = String(body.roomId).slice(0, 80);
    if (!this.canJoinCall(socket.userId, roomId)) return;
    socket.join(this.callRoom(roomId));
    this.emitIncomingCall(socket, roomId, String(body.label ?? ""));
    socket.to(this.callRoom(roomId)).emit("call:user-joined", { roomId, user: this.auth.findUserById(socket.userId), label: body.label ?? "" });
  }

  @SubscribeMessage("call:leave")
  leaveCall(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { roomId?: string }) {
    if (!socket.userId || !body.roomId) return;
    const roomId = String(body.roomId).slice(0, 80);
    socket.leave(this.callRoom(roomId));
    socket.to(this.callRoom(roomId)).emit("call:user-left", { roomId, userId: socket.userId });
  }

  @SubscribeMessage("call:signal")
  signal(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { roomId?: string; payload?: unknown }) {
    if (!socket.userId || !body.roomId) return;
    const roomId = String(body.roomId).slice(0, 80);
    if (!this.canJoinCall(socket.userId, roomId)) return;
    socket.to(this.callRoom(roomId)).emit("call:signal", { roomId, fromUserId: socket.userId, payload: body.payload });
  }

  emitMessage(message: any) {
    this.server.to(this.room(message.senderId)).emit("chat:message", message);
    this.server.to(this.room(message.recipientId)).emit("chat:message", message);
  }

  emitGroupMessage(message: any) {
    this.server.to(this.groupRoom(message.groupId)).emit("chat:group-message", message);
  }

  emitGroupUpdated(group: any) {
    for (const member of group.members ?? []) {
      this.server.to(this.room(member.id)).emit("chat:group-updated", group);
    }
  }

  createNotification(input: {
    userId: number;
    type: string;
    title: string;
    body?: string;
    actorId?: number | null;
    targetType?: string | null;
    targetId?: number | null;
  }) {
    if (input.actorId && input.actorId === input.userId) return null;
    const result = this.sqlite.database
      .prepare("INSERT INTO notifications (userId, type, title, body, actorId, targetType, targetId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        input.userId,
        input.type,
        input.title.slice(0, 80),
        (input.body ?? "").slice(0, 240),
        input.actorId ?? null,
        input.targetType ?? null,
        input.targetId ?? null,
        new Date().toISOString(),
      );

    const notification = this.notificationById(Number(result.lastInsertRowid));
    this.server.to(this.room(input.userId)).emit("notification:new", notification);
    return notification;
  }

  private broadcastPresence() {
    this.server.emit("presence:update", this.presence.onlineIds());
  }

  private room(userId: number) {
    return `user:${userId}`;
  }

  private groupRoom(groupId: number) {
    return `group:${groupId}`;
  }

  private callRoom(roomId: string) {
    return `call:${roomId}`;
  }

  private canJoinCall(userId: number, roomId: string) {
    if (roomId.startsWith("direct-")) {
      const ids = roomId
        .replace("direct-", "")
        .split("-")
        .map((id) => Number(id))
        .filter(Boolean);
      return ids.length === 2 && ids.includes(userId);
    }

    if (roomId.startsWith("group-")) {
      const groupId = Number(roomId.replace("group-", ""));
      return Boolean(this.sqlite.database.prepare("SELECT 1 FROM chat_group_members WHERE groupId = ? AND userId = ?").get(groupId, userId));
    }

    return false;
  }

  private emitIncomingCall(socket: AuthedSocket, roomId: string, label: string) {
    if (!socket.userId) return;
    const user = this.auth.findUserById(socket.userId);
    const payload = { roomId, user, label };

    if (roomId.startsWith("direct-")) {
      const ids = roomId
        .replace("direct-", "")
        .split("-")
        .map((id) => Number(id))
        .filter(Boolean);
      for (const id of ids) {
        if (id !== socket.userId) socket.to(this.room(id)).emit("call:incoming", payload);
      }
      return;
    }

    if (roomId.startsWith("group-")) {
      const groupId = Number(roomId.replace("group-", ""));
      socket.to(this.groupRoom(groupId)).emit("call:incoming", payload);
    }
  }

  private shapeMessage(row: any) {
    return {
      id: Number(row.id),
      senderId: Number(row.senderId),
      recipientId: Number(row.recipientId),
      content: row.content,
      createdAt: row.createdAt,
      sender: this.auth.findUserById(Number(row.senderId)),
      recipient: this.auth.findUserById(Number(row.recipientId)),
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

  private notificationById(id: number) {
    const row = this.sqlite.database
      .prepare(
        `SELECT n.*, u.username, u.displayName, u.avatarConfig, u.avatarImage, u.avatarLocked, u.bio, u.pageConfig, u.createdAt as actorCreatedAt
         FROM notifications n
         LEFT JOIN users u ON u.id = n.actorId
         WHERE n.id = ?`,
      )
      .get(id) as any;

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
