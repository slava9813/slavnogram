import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envFile = path.join(root, ".env");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

const env = {
  ...process.env,
  ...readEnvFile(envFile),
  PROJECT_ROOT: root,
};

env.HOST ||= "0.0.0.0";
env.PORT ||= "4000";
env.PUBLIC_URL ||= `http://localhost:${env.PORT}`;
env.NEXT_PUBLIC_API_URL = env.PUBLIC_URL;

console.log(`Building Slavnogram for ${env.PUBLIC_URL}`);

for (const args of [
  ["run", "build", "--workspace", "apps/web"],
  ["run", "build", "--workspace", "apps/api"],
]) {
  const isWindows = process.platform === "win32";
  const result = spawnSync(isWindows ? process.env.ComSpec || "cmd.exe" : "npm", isWindows ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : args, {
    cwd: root,
    env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status) process.exit(result.status);
}
