#!/usr/bin/env node
// Generate a bcrypt hash and print it pre-escaped for use in .env files.
//
// 重要：Next.js 的 @next/env 会把值里的 $VAR 当成变量引用展开，
// 而 bcrypt 哈希以 "$2a$10$..." 开头，必须把每个 $ 转义为 \$ 才不会被截断。
// 这个脚本输出的就是已转义的形式，可以直接粘贴到 .env：
//
//   AUTH_PASS_HASH=<paste here>
import bcrypt from "bcryptjs";

const pw = process.argv[2];
if (!pw) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}
const hash = bcrypt.hashSync(pw, 10);
const escaped = hash.replaceAll("$", "\\$");
console.log(escaped);
