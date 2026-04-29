import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import express, { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { AppModule } from "./app.module";
import { env, projectRoot, publicUrl, uploadsRoot } from "./config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const host = env("HOST", "0.0.0.0");
  const port = Number(env("PORT", "4000"));
  const uploads = uploadsRoot();
  const webOut = path.join(projectRoot(), "apps", "web", "out");

  fs.mkdirSync(uploads, { recursive: true });

  app.enableCors({ origin: true, credentials: true });
  app.use("/uploads", express.static(uploads));

  if (fs.existsSync(path.join(webOut, "index.html"))) {
    app.use(express.static(webOut));
    app.use((req: Request, res: Response, next: NextFunction) => {
      const apiPrefixes = ["/auth", "/users", "/posts", "/friends", "/chat", "/communities", "/notifications", "/admin", "/health", "/uploads", "/socket.io"];
      if (apiPrefixes.some((prefix) => req.path.startsWith(prefix))) return next();
      res.sendFile(path.join(webOut, "index.html"));
    });
  }

  await app.listen(port, host);
  console.log(`Slavnogram API listening on http://${host}:${port}`);
  console.log(`PUBLIC_URL=${publicUrl()}`);
}

bootstrap();
