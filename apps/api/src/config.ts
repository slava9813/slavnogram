import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

let cachedRoot: string | null = null;

export function projectRoot() {
  if (process.env.PROJECT_ROOT) return process.env.PROJECT_ROOT;
  if (cachedRoot) return cachedRoot;

  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, "apps", "api")) && fs.existsSync(path.join(dir, "package.json"))) {
      cachedRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  cachedRoot = path.resolve(__dirname, "../../..");
  return cachedRoot;
}

dotenv.config({ path: path.join(projectRoot(), ".env") });

export function env(name: string, fallback: string) {
  return process.env[name] || fallback;
}

export function publicUrl() {
  return env("PUBLIC_URL", `http://localhost:${env("PORT", "4000")}`).replace(/\/$/, "");
}

export function apiRoot() {
  return path.resolve(__dirname, "..");
}

export function dataFilePath() {
  const dbPath = env("DB_PATH", "./data/slavnogram.sqlite");
  return path.isAbsolute(dbPath) ? dbPath : path.resolve(projectRoot(), dbPath);
}

export function uploadsRoot() {
  const uploadsPath = env("UPLOADS_DIR", "./apps/api/uploads");
  return path.isAbsolute(uploadsPath) ? uploadsPath : path.resolve(projectRoot(), uploadsPath);
}
