#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type Level = 'pass' | 'warn' | 'fail' | 'skip' | 'info';

type Check = {
  area: string;
  name: string;
  level: Level;
  detail?: string;
  recommendation?: string;
};

type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const full = hasFlag('full');
const skipTsc = hasFlag('skip-tsc');
const runLint = full || hasFlag('lint');
const jsonOutput = hasFlag('json');
const baseUrl = getOption('base-url') || process.env.STUDYTRACE_TEST_BASE_URL;
const cookie = getOption('cookie') || process.env.STUDYTRACE_TEST_COOKIE;
const allowCreditUse =
  hasFlag('allow-credit-use') ||
  process.env.STUDYTRACE_TEST_ALLOW_CREDITS === '1';

const checks: Check[] = [];

function hasFlag(name: string) {
  return args.includes(`--${name}`);
}

function getOption(name: string) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1];
  return undefined;
}

function filePath(relativePath: string) {
  return path.join(repoRoot, relativePath);
}

function readText(relativePath: string) {
  return readFileSync(filePath(relativePath), 'utf8');
}

function readJson(relativePath: string): unknown {
  return JSON.parse(readText(relativePath));
}

function add(check: Check) {
  checks.push(check);
}

function addFileCheck(area: string, relativePath: string, name = relativePath) {
  const exists = existsSync(filePath(relativePath));
  add({
    area,
    name,
    level: exists ? 'pass' : 'fail',
    detail: exists ? relativePath : `${relativePath} is missing`,
  });
  return exists;
}

function addContainsCheck(
  area: string,
  relativePath: string,
  label: string,
  patterns: Array<string | RegExp>,
  recommendation?: string
) {
  if (!existsSync(filePath(relativePath))) {
    add({
      area,
      name: label,
      level: 'fail',
      detail: `${relativePath} is missing`,
      recommendation,
    });
    return;
  }

  const source = readText(relativePath);
  const missing = patterns.filter((pattern) =>
    typeof pattern === 'string'
      ? !source.includes(pattern)
      : !pattern.test(source)
  );

  add({
    area,
    name: label,
    level: missing.length ? 'fail' : 'pass',
    detail: missing.length
      ? `Missing ${missing.length} expected marker(s) in ${relativePath}`
      : relativePath,
    recommendation,
  });
}

function parseEnvKeys(relativePath: string) {
  if (!existsSync(filePath(relativePath))) return new Map<string, string>();

  const entries = new Map<string, string>();
  for (const line of readText(relativePath).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    entries.set(match[1], value);
  }
  return entries;
}

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return prefix ? [prefix] : [];
  if (!value || typeof value !== 'object') return prefix ? [prefix] : [];

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, item]) => flattenKeys(item, prefix ? `${prefix}.${key}` : key)
  );
}

function runCommand(command: string, commandArgs: string[]): CommandResult {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function summarizeCommandOutput(result: CommandResult, maxLines = 12) {
  const output = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  return output.slice(-maxLines).join('\n');
}

function checkPackage() {
  const pkg = readJson('package.json') as {
    name?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const scripts = pkg.scripts || {};
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  add({
    area: 'package',
    name: 'app identity',
    level: pkg.name === 'studytrace' ? 'pass' : 'warn',
    detail: `package name: ${pkg.name || 'unknown'}`,
  });

  for (const script of ['dev', 'build', 'lint', 'test:capabilities']) {
    add({
      area: 'package',
      name: `script:${script}`,
      level: scripts[script] ? 'pass' : 'warn',
      detail: scripts[script] || 'missing',
      recommendation:
        script === 'test:capabilities'
          ? 'Keep a one-command capability audit in package.json.'
          : undefined,
    });
  }

  for (const dep of [
    'next',
    'react',
    'better-auth',
    'drizzle-orm',
    'next-intl',
    'pdfjs-dist',
    'html2canvas',
    'jspdf',
    'tsx',
  ]) {
    add({
      area: 'package',
      name: `dependency:${dep}`,
      level: deps[dep] ? 'pass' : 'warn',
      detail: deps[dep] || 'missing',
    });
  }

  const hasTestRunner = ['vitest', 'jest', '@playwright/test'].some(
    (dep) => deps[dep]
  );
  add({
    area: 'package',
    name: 'dedicated test runner',
    level: hasTestRunner ? 'pass' : 'warn',
    detail: hasTestRunner ? 'present' : 'not configured',
    recommendation:
      'Add Vitest for pure helpers and Playwright for authenticated StudyTrace flows.',
  });
}

function checkRoutesAndDataModel() {
  const expectedRoutes = [
    'src/app/[locale]/(landing)/studytrace/page.tsx',
    'src/app/[locale]/(landing)/studytrace/[id]/page.tsx',
    'src/app/api/studytrace/projects/create/route.ts',
    'src/app/api/studytrace/projects/save/route.ts',
    'src/app/api/studytrace/projects/get/route.ts',
    'src/app/api/studytrace/projects/list/route.ts',
    'src/app/api/studytrace/projects/delete/route.ts',
    'src/app/api/studytrace/ingest/route.ts',
    'src/app/api/studytrace/analyze/route.ts',
    'src/app/api/studytrace/reports/save/route.ts',
    'src/app/api/studytrace/reports/list/route.ts',
  ];

  for (const route of expectedRoutes) {
    addFileCheck('routes', route);
  }

  for (const schema of [
    'src/config/db/schema.postgres.ts',
    'src/config/db/schema.mysql.ts',
    'src/config/db/schema.sqlite.ts',
  ]) {
    addContainsCheck('database', schema, `${schema} StudyTrace tables`, [
      'studytraceProject',
      'studytraceFile',
      'studytraceEvidenceCard',
      'studytraceTimelineEvent',
      'studytraceAnalysisRun',
      'studytraceReport',
    ]);
  }
}

function checkWorkflowCoverage() {
  const workspace = 'src/shared/blocks/studytrace/workspace.tsx';
  const lib = 'src/shared/blocks/studytrace/lib.ts';

  addContainsCheck('workflow', workspace, 'five-step workspace tabs', [
    'TabsContent value="upload"',
    'TabsContent value="cards"',
    'TabsContent value="timeline"',
    'TabsContent value="risk"',
    'TabsContent value="report"',
  ]);

  addContainsCheck('workflow', workspace, 'core user actions', [
    'const handleFiles',
    'const regenerateCards',
    'const runAnalysis',
    'const downloadReport',
    'const exportPdf',
    'const loadDemoData',
  ]);

  addContainsCheck('workflow', workspace, 'StudyTrace API calls from UI', [
    '/api/studytrace/ingest',
    '/api/studytrace/analyze',
    '/api/studytrace/projects/save',
    '/api/studytrace/reports/save',
    '/api/studytrace/reports/list',
  ]);

  addContainsCheck('workflow', lib, 'local persistence and sanitizers', [
    'STORAGE_KEY',
    'sanitizeSavedFile',
    'sanitizeSavedCard',
    'sanitizeSavedTimelineEvent',
    'sanitizeSavedAnalysis',
    'stripExtractedTextFromFiles',
  ]);

  addContainsCheck('workflow', lib, 'evidence categories', [
    "'paper'",
    "'citation'",
    "'writing-process'",
    "'ai-use'",
    "'school'",
    "'appeal'",
  ]);
}

function checkAiContractAndSafety() {
  const analyze = 'src/app/api/studytrace/analyze/route.ts';
  const ingest = 'src/app/api/studytrace/ingest/route.ts';
  const settings = 'src/shared/services/settings.ts';

  addContainsCheck('ai-contract', analyze, 'analysis output contract', [
    'trustScore',
    'riskDimensions',
    'processConclusion',
    'timelineFindings',
    'evidenceGaps',
    'appealOutline',
    'aiBoundaryStatement',
    'exportChecklist',
    'strict JSON only',
  ]);

  addContainsCheck('ai-contract', ingest, 'ingest output contract', [
    'evidenceCards',
    'timelineEvents',
    'assignment',
    'submitStatus',
    'proofTarget',
    'paperLocator',
    'strict JSON only',
  ]);

  addContainsCheck('ai-safety', analyze, 'analysis safety framing', [
    'Do not help evade detection',
    'fabricate evidence',
    'Use explanatory wording, not verdict wording',
    'This product does not decide whether academic misconduct occurred',
  ]);

  addContainsCheck('ai-safety', ingest, 'ingest safety framing', [
    'Do not invent drafts',
    'Do not help evade AI detection',
    'fabricate evidence',
    'Avoid wording such as "suspected plagiarism"',
  ]);

  addContainsCheck('ai-config', settings, 'admin settings registration', [
    'studytrace_ai_provider',
    'studytrace_ai_base_url',
    'studytrace_ai_model',
    'studytrace_ai_api_key',
    'studytrace_analysis_cost_credits',
    'studytrace_analysis_min_interval_ms',
    'studytrace_ingest_cost_credits',
    'studytrace_ingest_min_interval_ms',
  ]);

  const analyzeSource = existsSync(filePath(analyze)) ? readText(analyze) : '';
  const ingestSource = existsSync(filePath(ingest)) ? readText(ingest) : '';

  add({
    area: 'resilience',
    name: 'analysis local fallback',
    level:
      analyzeSource.includes("providerStatus: 'local'") &&
      analyzeSource.includes('DEFAULT_ANALYSIS')
        ? 'pass'
        : 'warn',
    detail: 'analyze route should return a usable local result when AI fails',
  });

  add({
    area: 'resilience',
    name: 'ingest local fallback',
    level: ingestSource.includes("providerStatus: 'local'") ? 'pass' : 'warn',
    detail:
      'ingest route currently returns an error when the AI provider is unavailable',
    recommendation:
      'Add a server-side non-AI ingest fallback or clearly keep API-only clients outside the supported path.',
  });
}

function checkI18n() {
  const enPath = 'src/config/locale/messages/en/studytrace.json';
  const zhPath = 'src/config/locale/messages/zh/studytrace.json';

  if (!addFileCheck('i18n', enPath) || !addFileCheck('i18n', zhPath)) return;

  const en = readJson(enPath);
  const zh = readJson(zhPath);
  const enKeys = new Set(flattenKeys(en));
  const zhKeys = new Set(flattenKeys(zh));
  const missingInZh = [...enKeys].filter((key) => !zhKeys.has(key));
  const missingInEn = [...zhKeys].filter((key) => !enKeys.has(key));

  add({
    area: 'i18n',
    name: 'en/zh key parity',
    level: missingInZh.length || missingInEn.length ? 'fail' : 'pass',
    detail: [
      `missing in zh: ${missingInZh.length}`,
      `missing in en: ${missingInEn.length}`,
    ].join(', '),
    recommendation:
      missingInZh.length || missingInEn.length
        ? 'Keep locale JSON key trees identical to prevent runtime translation misses.'
        : undefined,
  });

  for (const key of [
    'workspace.tabs.upload',
    'workspace.tabs.cards',
    'workspace.tabs.timeline',
    'workspace.tabs.risk',
    'workspace.tabs.report',
    'reportDoc.disclaimer',
  ]) {
    add({
      area: 'i18n',
      name: `required key:${key}`,
      level: enKeys.has(key) && zhKeys.has(key) ? 'pass' : 'fail',
      detail: enKeys.has(key) && zhKeys.has(key) ? 'present' : 'missing',
    });
  }
}

function checkReportExport() {
  addContainsCheck(
    'report',
    'src/shared/blocks/studytrace/workspace.tsx',
    'report sections',
    [
      'reportDoc.basicHeading',
      'reportDoc.processHeading',
      'reportDoc.citationSummaryHeading',
      'reportDoc.aiBoundaryHeading',
      'reportDoc.cardsHeading',
      'reportDoc.timelineHeading',
      'reportDoc.fingerprintHeading',
      'reportDoc.appealHeading',
      'reportDoc.disclaimerHeading',
    ]
  );

  addContainsCheck(
    'report',
    'src/shared/blocks/studytrace/report-pdf.ts',
    'PDF export support',
    ['exportReportPdf', 'openReportPdfPrintFallback', 'jsPDF', 'html2canvas']
  );
}

function checkEnvironment() {
  const example = parseEnvKeys('.env.example');
  const local = parseEnvKeys('.env.local');
  const required = [
    'STUDYTRACE_AI_PROVIDER',
    'STUDYTRACE_AI_BASE_URL',
    'STUDYTRACE_AI_MODEL',
    'STUDYTRACE_AI_API_KEY',
    'STUDYTRACE_ANALYSIS_COST_CREDITS',
    'STUDYTRACE_ANALYSIS_MIN_INTERVAL_MS',
    'STUDYTRACE_INGEST_COST_CREDITS',
    'STUDYTRACE_INGEST_MIN_INTERVAL_MS',
  ];

  for (const key of required) {
    add({
      area: 'env',
      name: `.env.example:${key}`,
      level: example.has(key) ? 'pass' : 'fail',
      detail: example.has(key) ? 'documented' : 'missing',
    });
  }

  if (!existsSync(filePath('.env.local'))) {
    add({
      area: 'env',
      name: '.env.local',
      level: 'warn',
      detail: 'not present',
      recommendation:
        'Create .env.local for real local credentials; keep secrets out of tracked files.',
    });
    return;
  }

  add({
    area: 'env',
    name: '.env.local',
    level: 'pass',
    detail: 'present; values were not printed',
  });

  add({
    area: 'env',
    name: 'local StudyTrace AI key',
    level: local.get('STUDYTRACE_AI_API_KEY') ? 'pass' : 'warn',
    detail: local.get('STUDYTRACE_AI_API_KEY')
      ? 'configured; value hidden'
      : 'empty or missing',
    recommendation:
      'Without a local API key, online ingest/analyze quality cannot be exercised.',
  });
}

function checkEngineeringCommands() {
  if (skipTsc) {
    add({
      area: 'engineering',
      name: 'typescript',
      level: 'skip',
      detail: 'skipped by --skip-tsc',
    });
  } else if (!existsSync(filePath('node_modules/.bin/tsc'))) {
    add({
      area: 'engineering',
      name: 'typescript',
      level: 'warn',
      detail: 'node_modules/.bin/tsc not found',
      recommendation: 'Install dependencies before running the full audit.',
    });
  } else {
    const result = runCommand('./node_modules/.bin/tsc', [
      '--noEmit',
      '--pretty',
      'false',
    ]);
    add({
      area: 'engineering',
      name: 'typescript',
      level: result.status === 0 ? 'pass' : 'fail',
      detail:
        result.status === 0
          ? 'tsc --noEmit passed'
          : summarizeCommandOutput(result),
      recommendation:
        result.status === 0
          ? undefined
          : 'Fix TypeScript errors before trusting product-level capability results.',
    });
  }

  if (!runLint) {
    add({
      area: 'engineering',
      name: 'eslint',
      level: 'skip',
      detail: 'run with --lint or --full',
    });
    return;
  }

  if (!existsSync(filePath('node_modules/.bin/eslint'))) {
    add({
      area: 'engineering',
      name: 'eslint',
      level: 'warn',
      detail: 'node_modules/.bin/eslint not found',
    });
    return;
  }

  const result = runCommand('./node_modules/.bin/eslint', ['.']);
  add({
    area: 'engineering',
    name: 'eslint',
    level: result.status === 0 ? 'pass' : 'fail',
    detail:
      result.status === 0 ? 'eslint passed' : summarizeCommandOutput(result),
    recommendation:
      result.status === 0
        ? undefined
        : 'Fix lint violations or tune rules so CI can enforce them.',
  });
}

async function checkOptionalHttpSmoke() {
  if (!baseUrl) {
    add({
      area: 'live-smoke',
      name: 'dev server',
      level: 'skip',
      detail:
        'pass --base-url or STUDYTRACE_TEST_BASE_URL to test a running app',
    });
    return;
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  try {
    const page = await fetchWithTimeout(`${normalizedBaseUrl}/en/studytrace`, {
      redirect: 'manual',
    });
    add({
      area: 'live-smoke',
      name: 'studytrace page reachable',
      level: page.status >= 200 && page.status < 400 ? 'pass' : 'warn',
      detail: `HTTP ${page.status}`,
    });
  } catch (error) {
    add({
      area: 'live-smoke',
      name: 'studytrace page reachable',
      level: 'warn',
      detail: error instanceof Error ? error.message : String(error),
      recommendation: 'Start the dev server before running live smoke checks.',
    });
    return;
  }

  const unauth = await postJson(`${normalizedBaseUrl}/api/studytrace/analyze`, {
    localAnalysis: {
      trustScore: 42,
      summary: 'Local smoke analysis',
      riskItems: ['Missing citation source'],
      timelineFindings: ['Draft timeline exists'],
      evidenceGaps: ['Add source metadata'],
      appealOutline: ['Explain writing process'],
      aiBoundaryStatement: 'Grammar-only AI assistance declared',
      exportChecklist: ['Attach drafts'],
    },
  });

  add({
    area: 'live-smoke',
    name: 'unauthenticated analyze guard',
    level:
      unauth.ok &&
      unauth.json?.code === -1 &&
      String(unauth.json?.message || '').includes('auth')
        ? 'pass'
        : 'warn',
    detail: unauth.ok
      ? `code=${String(unauth.json?.code)}, message=${String(
          unauth.json?.message
        )}`
      : unauth.error || 'request failed',
  });

  if (!cookie) {
    add({
      area: 'live-smoke',
      name: 'authenticated API smoke',
      level: 'skip',
      detail: 'pass --cookie or STUDYTRACE_TEST_COOKIE to test signed-in APIs',
    });
    return;
  }

  const projectList = await postJson(
    `${normalizedBaseUrl}/api/studytrace/projects/list`,
    { page: 1, limit: 1 },
    cookie
  );
  add({
    area: 'live-smoke',
    name: 'authenticated project list',
    level: projectList.ok && projectList.json?.code === 0 ? 'pass' : 'warn',
    detail: projectList.ok
      ? `code=${String(projectList.json?.code)}, message=${String(
          projectList.json?.message
        )}`
      : projectList.error || 'request failed',
  });

  if (!allowCreditUse) {
    add({
      area: 'live-smoke',
      name: 'authenticated analyze',
      level: 'skip',
      detail:
        'skipped unless --allow-credit-use is set, because AI-backed analysis may consume credits',
    });
    return;
  }

  const analyze = await postJson(
    `${normalizedBaseUrl}/api/studytrace/analyze`,
    {
      localAnalysis: {
        trustScore: 55,
        summary: 'Local fallback smoke analysis',
        riskItems: ['Citation metadata needs review'],
        timelineFindings: ['Draft and revision evidence are present'],
        evidenceGaps: ['Add DOI or publisher pages'],
        appealOutline: ['State concern', 'List evidence', 'Request review'],
        aiBoundaryStatement: 'AI use was limited to grammar review.',
        exportChecklist: ['Attach draft history', 'Attach source metadata'],
      },
      evidenceCards: [],
      timelineEvents: [],
      files: [],
    },
    cookie
  );
  const analyzeData = analyze.json?.data as
    | { analysis?: { providerStatus?: unknown } }
    | undefined;
  add({
    area: 'live-smoke',
    name: 'authenticated analyze response',
    level:
      analyze.ok && analyze.json?.code === 0 && analyzeData?.analysis
        ? 'pass'
        : 'warn',
    detail: analyze.ok
      ? `code=${String(analyze.json?.code)}, provider=${String(
          analyzeData?.analysis?.providerStatus || 'unknown'
        )}`
      : analyze.error || 'request failed',
  });
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function postJson(
  url: string,
  body: unknown,
  requestCookie?: string
): Promise<{
  ok: boolean;
  json?: { code?: unknown; message?: unknown; data?: Record<string, unknown> };
  error?: string;
}> {
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(requestCookie ? { Cookie: requestCookie } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => undefined)) as
      | { code?: unknown; message?: unknown; data?: Record<string, unknown> }
      | undefined;
    return { ok: response.ok, json };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function deriveRecommendations() {
  const recommendations = new Set<string>();
  for (const check of checks) {
    if (check.recommendation && check.level !== 'pass') {
      recommendations.add(check.recommendation);
    }
  }

  if (
    checks.some(
      (check) =>
        check.area === 'package' &&
        check.name === 'dedicated test runner' &&
        check.level === 'warn'
    )
  ) {
    recommendations.add(
      'Introduce real automated tests: unit-test lib.ts helpers, route contract tests, and a Playwright upload-to-report path.'
    );
  }

  if (
    checks.some(
      (check) =>
        check.area === 'live-smoke' &&
        check.name === 'authenticated API smoke' &&
        check.level === 'skip'
    )
  ) {
    recommendations.add(
      'Create a stable local test user/session or seed path so authenticated APIs can be tested without manual cookies.'
    );
  }

  if (
    checks.some(
      (check) =>
        check.area === 'env' &&
        check.name === 'local StudyTrace AI key' &&
        check.level === 'warn'
    )
  ) {
    recommendations.add(
      'Run a separate provider integration check with a real key before judging AI extraction quality.'
    );
  }

  return [...recommendations];
}

function printReport() {
  const totals = {
    pass: checks.filter((check) => check.level === 'pass').length,
    warn: checks.filter((check) => check.level === 'warn').length,
    fail: checks.filter((check) => check.level === 'fail').length,
    skip: checks.filter((check) => check.level === 'skip').length,
    info: checks.filter((check) => check.level === 'info').length,
  };
  const recommendations = deriveRecommendations();

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          totals,
          checks,
          recommendations,
        },
        null,
        2
      )
    );
    return;
  }

  console.log('StudyTrace capability audit');
  console.log(
    `Summary: ${totals.pass} pass, ${totals.warn} warn, ${totals.fail} fail, ${totals.skip} skip`
  );
  console.log('');

  for (const area of [...new Set(checks.map((check) => check.area))]) {
    console.log(`[${area}]`);
    for (const check of checks.filter((item) => item.area === area)) {
      const level = check.level.toUpperCase().padEnd(4);
      console.log(`  ${level} ${check.name}`);
      if (check.detail) {
        for (const line of check.detail.split('\n')) {
          console.log(`       ${line}`);
        }
      }
    }
    console.log('');
  }

  if (recommendations.length) {
    console.log('Recommended improvements');
    recommendations.forEach((item, index) => {
      console.log(`${index + 1}. ${item}`);
    });
    console.log('');
  }

  if (totals.fail > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  checkPackage();
  checkRoutesAndDataModel();
  checkWorkflowCoverage();
  checkAiContractAndSafety();
  checkI18n();
  checkReportExport();
  checkEnvironment();
  checkEngineeringCommands();
  await checkOptionalHttpSmoke();
  printReport();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
