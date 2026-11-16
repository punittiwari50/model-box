#!/usr/bin/env node
const fs = require("fs");
const file = process.argv[2];
if (!file || !fs.existsSync(file)) process.exit(0);
try {
  const raw = fs.readFileSync(file, "utf8");
  const clean = raw.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\x1b\]8;;.*?\x1b\\/g, "");
  const match = clean.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?[A-Za-z0-9._~:/?#\[\]@!$&()*+,;=% \r\n-]+/);
  if (match) {
    const unwrapped = match[0]
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(
        (s) =>
          !s.startsWith("(") &&
          !s.includes("Navigate") &&
          !s.includes("paste") &&
          !s.includes("authorization code") &&
          !s.includes("Copy and paste"),
      )
      .join("");
    const urlMatch = unwrapped.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/(?:v2\/)?auth\?[A-Za-z0-9._~:/?#\[\]@!$&()*+,;=%-]+/);
    if (urlMatch) {
      let finalUrl = urlMatch[0];
      const waitingIdx = finalUrl.indexOf("Waiting");
      if (waitingIdx > 0) finalUrl = finalUrl.slice(0, waitingIdx);
      const bracketIdx = finalUrl.indexOf("[");
      if (bracketIdx > 0) finalUrl = finalUrl.slice(0, bracketIdx);
      if (!finalUrl.includes("response_type=")) {
        finalUrl += (finalUrl.includes("?") ? "&" : "?") + "response_type=code";
      }
      process.stdout.write(finalUrl);
    }
  }
} catch {
  process.exit(0);
}
