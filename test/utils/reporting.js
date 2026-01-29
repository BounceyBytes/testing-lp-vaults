const fs = require("fs");
const path = require("path");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function tsSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function resultsDir() {
  return path.join(__dirname, "..", "..", "test-results");
}

function writeJson(fileBase, payload) {
  const dir = resultsDir();
  ensureDir(dir);
  const filePath = path.join(dir, `${fileBase}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

function writeMarkdown(fileBase, markdown) {
  const dir = resultsDir();
  ensureDir(dir);
  const filePath = path.join(dir, `${fileBase}.md`);
  fs.writeFileSync(filePath, markdown);
  return filePath;
}

function generateMarkdownReport(run) {
  const start = run.startTime;
  const end = run.endTime;
  const durationSec = end ? (new Date(end) - new Date(start)) / 1000 : 0;
  const summary = run.summary || { total: 0, passed: 0, failed: 0, skipped: 0 };

  let out = "# LP Vault Test Report\n\n";
  out += `**Suite**: ${run.suite || "unknown"}\n`;
  out += `**Network**: ${run.network || "unknown"}\n`;
  out += `**Generated**: ${new Date().toISOString()}\n`;
  out += `**Start**: ${start}\n`;
  out += `**End**: ${end || "(incomplete)"}\n`;
  out += `**Duration**: ${(durationSec / 60).toFixed(2)} minutes\n\n`;

  out += "## Summary\n\n";
  out += "| Metric | Count |\n|---|---:|\n";
  out += `| Total | ${summary.total ?? 0} |\n`;
  out += `| Passed | ${summary.passed ?? 0} |\n`;
  out += `| Failed | ${summary.failed ?? 0} |\n`;
  out += `| Skipped | ${summary.skipped ?? 0} |\n\n`;

  const vaults = run.vaults || [];
  if (vaults.length) {
    out += "## Vault Results\n\n";
    out += "| Vault | Scenario | Status | Notes |\n|---|---|---|---|\n";
    for (const v of vaults) {
      const scenarios = v.scenarios || [];
      if (!scenarios.length) {
        out += `| ${v.name || v.vault || "(unknown)"} | (none) | ${v.status || ""} | ${v.note || ""} |\n`;
        continue;
      }
      for (const s of scenarios) {
        const status = s.success ? "✅" : (s.skipped ? "⏭" : "❌");
        const notes = s.note || s.error || "";
        out += `| ${v.name || v.vault || "(unknown)"} | ${s.name || s.scenario || "(scenario)"} | ${status} | ${String(notes).slice(0, 120)} |\n`;
      }
    }
    out += "\n";
  }

  const diagnostics = run.diagnostics || [];
  if (diagnostics.length) {
    out += "## Diagnostics\n\n";
    for (const d of diagnostics) {
      out += `- ${JSON.stringify(d)}\n`;
    }
    out += "\n";
  }

  return out;
}

function createRunReporter({ suite, network }) {
  const run = {
    suite,
    network,
    startTime: new Date().toISOString(),
    endTime: null,
    summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
    vaults: [],
    diagnostics: []
  };

  const vaultIndex = new Map();

  function getVaultEntry(vaultName, meta = {}) {
    if (!vaultIndex.has(vaultName)) {
      const entry = { name: vaultName, ...meta, scenarios: [] };
      vaultIndex.set(vaultName, entry);
      run.vaults.push(entry);
    }
    return vaultIndex.get(vaultName);
  }

  return {
    run,
    addDiagnostic(diag) {
      run.diagnostics.push(diag);
    },
    recordScenario(vaultName, scenarioName, outcome) {
      run.summary.total++;
      if (outcome?.skipped) run.summary.skipped++;
      else if (outcome?.success) run.summary.passed++;
      else run.summary.failed++;

      const entry = getVaultEntry(vaultName, outcome?.vaultMeta);
      entry.scenarios.push({ name: scenarioName, ...outcome });
    },
    finalize({ filePrefix } = {}) {
      run.endTime = new Date().toISOString();
      const base = `${filePrefix || suite}-${tsSlug(new Date(run.startTime))}`;
      const jsonPath = writeJson(base, run);
      const mdPath = writeMarkdown(base, generateMarkdownReport(run));
      return { jsonPath, mdPath, baseName: base };
    }
  };
}

module.exports = {
  createRunReporter,
  generateMarkdownReport
};
