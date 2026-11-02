import * as fs from "node:fs";
import * as path from "node:path";

function normalizeDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      normalizeDir(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") || entry.name.endsWith(".json"))) {
      const content = fs.readFileSync(fullPath, "utf8");
      if (content.includes("\r\n")) {
        fs.writeFileSync(fullPath, content.replace(/\r\n/g, "\n"), "utf8");
      }
    }
  }
}

const target = process.argv[2] || "packages";
normalizeDir(target);
console.log("Normalized EOL in", target);

