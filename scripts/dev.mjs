import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

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

const fileEnv = readEnvFile(path.join(root, ".env"));
const env = {
  ...process.env,
  ...fileEnv,
  PROJECT_ROOT: root,
};

env.HOST ||= "0.0.0.0";
env.PORT ||= "4000";
env.WEB_PORT ||= "3000";
env.PUBLIC_URL ||= `http://localhost:${env.PORT}`;
env.NEXT_PUBLIC_API_URL = env.PUBLIC_URL;

const children = [];

function run(name, args, cwd) {
  const isWindows = process.platform === "win32";
  const child = spawn(isWindows ? process.env.ComSpec || "cmd.exe" : "npm", isWindows ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : args, {
    cwd,
    env,
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    if (code && !process.exitCode) process.exitCode = code;
  });

  children.push(child);
}

process.on("SIGINT", () => {
  for (const child of children) child.kill("SIGINT");
  process.exit();
});

console.log(`Slavnogram API: ${env.PUBLIC_URL} (${env.HOST}:${env.PORT})`);
console.log(`Slavnogram Web: http://localhost:${env.WEB_PORT}`);

run("api", ["run", "dev", "--workspace", "apps/api"], root);
run("web", ["run", "dev", "--workspace", "apps/web"], root);
