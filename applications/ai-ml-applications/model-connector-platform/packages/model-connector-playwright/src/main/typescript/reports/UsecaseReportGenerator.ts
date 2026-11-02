import { fileUtils, pathUtils } from "@model-box/model-connector-core";
import type { IUsecaseSuiteSummary, IUsecaseResult } from "@/usecases/contracts/IUsecaseTest.js";

/**
 * Report Generator for Playwright Use-Case Testing Suite.
 * Emits HTML, Markdown, and JSON artifacts to the bidirectional volume directory.
 * Conforms to STD-COD-007 (SLAP <= 20 lines) and STD-COD-011 (Core Utils).
 */
export class UsecaseReportGenerator {
  public static async generateReports(summary: IUsecaseSuiteSummary, outputDir: string): Promise<void> {
    fileUtils.ensureDirectory(outputDir);
    const jsonPath = pathUtils.join(outputDir, "usecase-results.json");
    const mdPath = pathUtils.join(outputDir, "usecase-test-report.md");
    const htmlPath = pathUtils.join(outputDir, "usecase-test-report.html");

    await fileUtils.writeJson(jsonPath, summary);
    await fileUtils.writeFile(mdPath, this.buildMarkdownReport(summary));
    await fileUtils.writeFile(htmlPath, this.buildHtmlReport(summary));
    console.log(`\n[ReportGenerator] Reports successfully persisted to: ${outputDir}`);
  }

  public static buildMarkdownReport(s: IUsecaseSuiteSummary): string {
    const rate = ((s.passedUsecases / s.totalUsecases) * 100).toFixed(1);
    const lines = [
      `# Model Connector Platform - Use-Case Testing Report`,
      ``,
      `**Target UI:** \`${s.targetUrl}\`  `,
      `**Executed At:** \`${s.executedAt}\`  `,
      `**Duration:** \`${(s.totalDurationMs / 1000).toFixed(2)}s\`  `,
      `**Success Rate:** **${rate}%** (${s.passedUsecases}/${s.totalUsecases} Use Cases Passed)`,
      ``,
      `## Use-Case Execution Matrix`,
      ``,
      `| ID | Use Case Title | Category | Status | Duration | Steps |`,
      `|---|---|---|:---:|:---:|:---:|`,
    ];
    for (const r of s.results) {
      const statusPill = r.status === "PASSED" ? "✅ PASS" : "❌ FAIL";
      lines.push(`| **${r.usecaseId}** | ${r.title} | \`${r.category}\` | ${statusPill} | \`${r.durationMs}ms\` | ${r.steps.length} |`);
    }
    lines.push(``, `## Detailed Step Validations`, ``);
    for (const r of s.results) {
      lines.push(`### [${r.usecaseId}] ${r.title}`);
      lines.push(`*${r.description}*  `);
      lines.push(`**Status:** ${r.status === "PASSED" ? "✅ PASSED" : "❌ FAILED"} (\`${r.durationMs}ms\`)`);
      if (r.error) lines.push(`> ⚠️ **Error:** ${r.error}`);
      lines.push(``, `| Step | Description | Status | Latency | Details |`, `|:---:|---|:---:|:---:|---|`);
      for (const st of r.steps) {
        lines.push(`| ${st.stepNumber} | ${st.name} | ${st.status === "PASSED" ? "✔" : "✖"} | \`${st.durationMs}ms\` | ${st.details} |`);
      }
      lines.push(``);
    }
    return lines.join("\n");
  }

  public static buildHtmlReport(s: IUsecaseSuiteSummary): string {
    const rate = ((s.passedUsecases / s.totalUsecases) * 100).toFixed(1);
    const rows = s.results.map((r) => this.renderHtmlRow(r)).join("");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Model Connector Platform - Use Case Test Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 24px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #58a6ff; font-size: 24px; border-bottom: 1px solid #30363d; padding-bottom: 12px; }
    .metrics { display: flex; gap: 16px; margin: 20px 0; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; flex: 1; text-align: center; }
    .card .val { font-size: 28px; font-weight: bold; color: #7ee787; }
    .card .lbl { font-size: 12px; color: #8b949e; text-transform: uppercase; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; background: #161b22; border-radius: 8px; overflow: hidden; }
    th { background: #21262d; color: #f0f6fc; text-align: left; padding: 12px; font-size: 13px; }
    td { padding: 12px; border-top: 1px solid #30363d; font-size: 13px; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 12px; font-weight: bold; font-size: 11px; }
    .pass { background: rgba(35, 134, 54, 0.2); color: #3fb950; border: 1px solid rgba(63, 185, 80, 0.4); }
    .fail { background: rgba(218, 54, 51, 0.2); color: #f85149; border: 1px solid rgba(248, 81, 73, 0.4); }
    .steps { margin-top: 8px; font-size: 12px; color: #8b949e; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Model Connector Platform — Use-Case Testing Dashboard</h1>
    <div class="metrics">
      <div class="card"><div class="val">${s.totalUsecases}</div><div class="lbl">Total Use Cases</div></div>
      <div class="card"><div class="val" style="color: #3fb950;">${s.passedUsecases}</div><div class="lbl">Passed</div></div>
      <div class="card"><div class="val" style="color: ${s.failedUsecases > 0 ? '#f85149' : '#8b949e'};">${s.failedUsecases}</div><div class="lbl">Failed</div></div>
      <div class="card"><div class="val">${rate}%</div><div class="lbl">Success Rate</div></div>
      <div class="card"><div class="val">${(s.totalDurationMs / 1000).toFixed(2)}s</div><div class="lbl">Duration</div></div>
    </div>
    <table>
      <thead>
        <tr><th>ID</th><th>Use Case & Description</th><th>Category</th><th>Status</th><th>Latency</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</body>
</html>`;
  }

  private static renderHtmlRow(r: IUsecaseResult): string {
    const isPass = r.status === "PASSED";
    const badgeClass = isPass ? "pass" : "fail";
    const badgeText = isPass ? "✔ PASSED" : "✖ FAILED";
    const stepsSummary = r.steps.map((st) => `<div>• Step ${st.stepNumber}: ${st.name} (${st.durationMs}ms) - <em>${st.details}</em></div>`).join("");
    return `<tr>
      <td><strong>${r.usecaseId}</strong></td>
      <td><div><strong>${r.title}</strong></div><div style="color: #8b949e; font-size: 12px;">${r.description}</div><div class="steps">${stepsSummary}</div></td>
      <td><code>${r.category}</code></td>
      <td><span class="badge ${badgeClass}">${badgeText}</span></td>
      <td>${r.durationMs}ms</td>
    </tr>`;
  }
}

