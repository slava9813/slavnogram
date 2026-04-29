import { Injectable, OnModuleInit } from "@nestjs/common";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { dataFilePath } from "./config";

@Injectable()
export class SqliteService implements OnModuleInit {
  private db!: DatabaseSync;

  onModuleInit() {
    const filePath = dataFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  get database() {
    return this.db;
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        displayName TEXT NOT NULL,
        passwordHash TEXT NOT NULL,
        avatarConfig TEXT NOT NULL DEFAULT '{}',
        avatarImage TEXT,
        avatarLocked INTEGER NOT NULL DEFAULT 1,
        bio TEXT NOT NULL DEFAULT '',
        pageConfig TEXT NOT NULL DEFAULT '{}',
        settings TEXT NOT NULL DEFAULT '{}',
        role TEXT NOT NULL DEFAULT 'user',
        blocked INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        authorId INTEGER NOT NULL,
        communityId INTEGER,
        text TEXT NOT NULL,
        photoUrl TEXT,
        mediaUrl TEXT,
        mediaType TEXT NOT NULL DEFAULT 'image',
        tags TEXT NOT NULL DEFAULT '[]',
        updatedAt TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(authorId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(communityId) REFERENCES communities(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS post_likes (
        postId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY(postId, userId),
        FOREIGN KEY(postId) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        postId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        text TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(postId) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        friendId INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'accepted',
        requesterId INTEGER,
        createdAt TEXT NOT NULL,
        UNIQUE(userId, friendId),
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(friendId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(requesterId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        senderId INTEGER NOT NULL,
        recipientId INTEGER NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(senderId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(recipientId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chat_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ownerId INTEGER NOT NULL,
        name TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chat_group_members (
        groupId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY(groupId, userId),
        FOREIGN KEY(groupId) REFERENCES chat_groups(id) ON DELETE CASCADE,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS group_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        groupId INTEGER NOT NULL,
        senderId INTEGER NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(groupId) REFERENCES chat_groups(id) ON DELETE CASCADE,
        FOREIGN KEY(senderId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS communities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ownerId INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL,
        FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS community_members (
        communityId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY(communityId, userId),
        FOREIGN KEY(communityId) REFERENCES communities(id) ON DELETE CASCADE,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS saved_posts (
        postId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY(postId, userId),
        FOREIGN KEY(postId) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS moderation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        targetType TEXT NOT NULL,
        targetId INTEGER,
        reason TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        actorId INTEGER,
        targetType TEXT,
        targetId INTEGER,
        readAt TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(actorId) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS user_blocks (
        blockerId INTEGER NOT NULL,
        blockedId INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY(blockerId, blockedId),
        FOREIGN KEY(blockerId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(blockedId) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    this.ensureColumn("users", "avatarImage", "TEXT");
    this.ensureColumn("users", "avatarLocked", "INTEGER NOT NULL DEFAULT 1");
    this.ensureColumn("users", "bio", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("users", "pageConfig", "TEXT NOT NULL DEFAULT '{}'");
    this.ensureColumn("users", "settings", "TEXT NOT NULL DEFAULT '{}'");
    this.ensureColumn("users", "role", "TEXT NOT NULL DEFAULT 'user'");
    this.ensureColumn("users", "blocked", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("posts", "mediaUrl", "TEXT");
    this.ensureColumn("posts", "mediaType", "TEXT NOT NULL DEFAULT 'image'");
    this.ensureColumn("posts", "tags", "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("posts", "updatedAt", "TEXT");
    this.ensureColumn("friends", "requesterId", "INTEGER");
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (rows.some((row) => row.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}
