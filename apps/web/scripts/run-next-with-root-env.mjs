#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, "..");
const rootEnvPath = path.resolve(webDir, "..", "..", ".env");

function parseDotenv(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\\$/g, "$");
    out[key] = value;
  }
  return out;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf8");
  return parseDotenv(content);
}

function mergeRootEnv() {
  const rootEnv = loadEnvFile(rootEnvPath);
  for (const [key, value] of Object.entries(rootEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function runNext() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || !["dev", "build", "start"].includes(cmd)) {
    console.error("Usage: node scripts/run-next-with-root-env.mjs <dev|build|start> [args...]");
    process.exit(1);
  }
  mergeRootEnv();

  const nextBin = path.resolve(webDir, "node_modules", "next", "dist", "bin", "next");
  const args = cmd === "dev" ? [cmd, "-p", "3000", ...rest] : cmd === "start" ? [cmd, "-p", "3000", ...rest] : [cmd, ...rest];
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: webDir,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

runNext();
