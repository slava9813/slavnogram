import { Injectable } from "@nestjs/common";

@Injectable()
export class PresenceService {
  private readonly socketsByUser = new Map<number, Set<string>>();

  markOnline(userId: number, socketId: string) {
    const sockets = this.socketsByUser.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this.socketsByUser.set(userId, sockets);
  }

  markOffline(userId: number, socketId: string) {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (!sockets.size) this.socketsByUser.delete(userId);
  }

  isOnline(userId: number) {
    return this.socketsByUser.has(userId);
  }

  onlineIds() {
    return [...this.socketsByUser.keys()];
  }
}
