import { Module, forwardRef } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ChatController } from "./chat.controller";
import { ChatGateway } from "./chat.gateway";
import { CommunitiesController } from "./communities.controller";
import { FriendsController } from "./friends.controller";
import { JwtAuthGuard } from "./auth.guard";
import { PostsController } from "./posts.controller";
import { PresenceService } from "./presence.service";
import { SqliteService } from "./sqlite.service";
import { UsersController } from "./users.controller";

@Module({
  controllers: [AppController, AuthController, UsersController, PostsController, FriendsController, ChatController, CommunitiesController],
  providers: [SqliteService, AuthService, JwtAuthGuard, PresenceService, ChatGateway, PostsController],
})
export class AppModule {}
