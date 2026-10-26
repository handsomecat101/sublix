// Chèn tin @handoff của điều phối lên đầu AGENT_CHAT.md; chuyển tin cũ nhất sang ARCHIVE khi > 8 tin.
// Dùng: node tools/handoff.cjs <file_tin_nhan.md> [đường_dẫn_AGENT_CHAT.md]
// File tin nhắn: 3–7 dòng, bắt đầu bằng "### YYYY-MM-DD HH:MM - <Tên> -> @Team".
const fs = require("fs");
const path = require("path");
const msgPath = process.argv[2];
const chatPath = process.argv[3] || path.join(__dirname, "..", "AGENT_CHAT.md");
const archPath = path.join(path.dirname(chatPath), "ARCHIVE", "AGENT_CHAT_ARCHIVE.md");
if (!msgPath) throw new Error("thiếu file tin nhắn");
// Bỏ BOM (PowerShell `Out-File` hay ghi BOM) để tiêu đề "### " nằm đúng đầu dòng.
const msg = fs.readFileSync(msgPath, "utf8").replace(/^﻿/, "").replace(/\s*$/, "\n\n---\n");
let chat = fs.readFileSync(chatPath, "utf8");
// Chèn ngay trước tin "### " đầu tiên (hoặc cuối file nếu chưa có tin nào).
const first = chat.search(/^### /m);
chat = first < 0 ? chat.replace(/\s*$/, "\n\n") + msg : chat.slice(0, first) + msg + "\n" + chat.slice(first);
const heads = [...chat.matchAll(/^### /gm)].map((m) => m.index);
let moved = "";
while (heads.length > 8) {
  const start = heads.pop();
  moved = chat.slice(start) + "\n" + moved;
  chat = chat.slice(0, start);
}
fs.writeFileSync(chatPath, chat);
if (moved) {
  fs.mkdirSync(path.dirname(archPath), { recursive: true });
  const arch = fs.existsSync(archPath) ? fs.readFileSync(archPath, "utf8") : "# AGENT_CHAT_ARCHIVE.md — tin bàn giao cũ (không đọc khi boot)\n";
  fs.writeFileSync(archPath, arch.replace(/\s*$/, "\n\n") + moved);
}
console.log("ok — tin đã chèn; chuyển sang archive:", moved ? moved.split(/^### /m).length - 1 : 0, "tin");
