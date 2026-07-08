import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/core/db';
import {
  studytraceAnalysisRun,
  studytraceEvidenceCard,
  studytraceFile,
  studytraceProject,
  studytraceReport,
  studytraceTimelineEvent,
} from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';

export type StudyTraceAnalysis = {
  trustScore: number;
  summary: string;
  riskItems: string[];
  timelineFindings: string[];
  evidenceGaps: string[];
  appealOutline: string[];
  aiBoundaryStatement: string;
  exportChecklist: string[];
  providerStatus?: string;
};

export type StudyTraceAnalysisRun = typeof studytraceAnalysisRun.$inferSelect;
export type NewStudyTraceAnalysisRun =
  typeof studytraceAnalysisRun.$inferInsert;

export enum StudyTraceRunStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
}

function stringify(value: unknown, fallback = '[]') {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback));
  } catch {
    return fallback;
  }
}

function truncate(value: string, maxLength = 120_000) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export async function createStudyTraceAnalysisRun({
  userId,
  projectId,
  provider,
  model,
  status,
  providerStatus,
  analysis,
  inputSnapshot,
  rawOutput,
  error,
  costCredits = 0,
  creditId,
}: {
  userId: string;
  projectId?: string | null;
  provider?: string;
  model?: string;
  status: StudyTraceRunStatus | string;
  providerStatus?: string;
  analysis?: Partial<StudyTraceAnalysis>;
  inputSnapshot?: unknown;
  rawOutput?: unknown;
  error?: string;
  costCredits?: number;
  creditId?: string | null;
}) {
  const row: NewStudyTraceAnalysisRun = {
    id: getUuid(),
    userId,
    projectId: projectId || null,
    provider: provider || '',
    model: model || '',
    status,
    providerStatus: providerStatus || analysis?.providerStatus || 'local',
    trustScore: Number(analysis?.trustScore || 0),
    summary: analysis?.summary || '',
    riskItems: stringify(analysis?.riskItems),
    timelineFindings: stringify(analysis?.timelineFindings),
    evidenceGaps: stringify(analysis?.evidenceGaps),
    appealOutline: stringify(analysis?.appealOutline),
    aiBoundaryStatement: analysis?.aiBoundaryStatement || '',
    exportChecklist: stringify(analysis?.exportChecklist),
    inputSnapshot:
      inputSnapshot === undefined
        ? null
        : truncate(JSON.stringify(inputSnapshot, null, 2)),
    rawOutput:
      rawOutput === undefined
        ? null
        : truncate(JSON.stringify(rawOutput, null, 2)),
    error: error || null,
    costCredits,
    creditId: creditId || null,
  };

  const [result] = await db()
    .insert(studytraceAnalysisRun)
    .values(row)
    .returning();

  if (projectId && analysis) {
    await db()
      .update(studytraceProject)
      .set({
        latestTrustScore: Number(analysis.trustScore || 0),
        lastAnalyzedAt: new Date(),
      })
      .where(eq(studytraceProject.id, projectId));
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Project + snapshot persistence                                             */
/* -------------------------------------------------------------------------- */

export type StudyTraceProjectRow = typeof studytraceProject.$inferSelect;
export type StudyTraceFileRow = typeof studytraceFile.$inferSelect;
export type StudyTraceCardRow = typeof studytraceEvidenceCard.$inferSelect;
export type StudyTraceTimelineRow = typeof studytraceTimelineEvent.$inferSelect;
export type StudyTraceReportRow = typeof studytraceReport.$inferSelect;

export enum StudyTraceProjectStatus {
  ACTIVE = 'active',
  DELETED = 'deleted',
}

// Client-facing snapshot shapes (mirror the workspace.tsx front-end state).
export type SnapshotFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  extension: string;
  category: string;
  lastModified: string;
  extractedText?: string;
  checksum?: string;
};

export type SnapshotCard = {
  id: string;
  fileId?: string | null;
  title: string;
  kind: string;
  source: string;
  summary: string;
  notes: string;
  strength: string;
  proofTarget?: string;
  paperLocator?: string;
  submitStatus?: string;
  actionItems?: string[];
  tags: string[];
  riskFlags: string[];
};

export type SnapshotTimelineEvent = {
  id: string;
  fileId?: string | null;
  date: string;
  label: string;
  detail: string;
  source: string;
  strength: string;
  phase?: string;
  cardIds?: string[];
};

export type StudyTraceProjectSnapshot = {
  project: {
    id: string;
    title: string;
    courseName: string;
    institutionPolicy: string;
    concern: string;
    aiBoundary: string;
    settings: unknown;
    status: string;
    latestTrustScore: number;
    lastAnalyzedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  files: SnapshotFile[];
  cards: SnapshotCard[];
  timeline: SnapshotTimelineEvent[];
  analysis: StudyTraceAnalysis | null;
};

export type StudyTraceProjectSummary = {
  id: string;
  title: string;
  courseName: string;
  latestTrustScore: number;
  lastAnalyzedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  fileCount: number;
  cardCount: number;
};

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: unknown, fallback: unknown = {}): unknown {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type CreateStudyTraceProjectInput = {
  userId: string;
  title?: string;
  courseName?: string;
  institutionPolicy?: string;
  concern?: string;
  aiBoundary?: string;
  settings?: unknown;
};

export async function createStudyTraceProject(
  input: CreateStudyTraceProjectInput
): Promise<StudyTraceProjectRow> {
  const now = new Date();
  const [result] = await db()
    .insert(studytraceProject)
    .values({
      id: getUuid(),
      userId: input.userId,
      title: input.title || '',
      courseName: input.courseName || '',
      institutionPolicy: input.institutionPolicy || '',
      concern: input.concern || '',
      aiBoundary: input.aiBoundary || '',
      settings:
        input.settings === undefined
          ? '{}'
          : JSON.stringify(input.settings ?? {}),
      status: StudyTraceProjectStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return result;
}

export async function listStudyTraceProjects({
  userId,
  page = 1,
  limit = 50,
}: {
  userId: string;
  page?: number;
  limit?: number;
}): Promise<StudyTraceProjectSummary[]> {
  const rows: StudyTraceProjectRow[] = await db()
    .select()
    .from(studytraceProject)
    .where(
      and(
        eq(studytraceProject.userId, userId),
        eq(studytraceProject.status, StudyTraceProjectStatus.ACTIVE),
        isNull(studytraceProject.deletedAt)
      )
    )
    .orderBy(desc(studytraceProject.updatedAt))
    .limit(limit)
    .offset((page - 1) * limit);

  if (!rows.length) return [];

  // Aggregate counts for all projects in two queries instead of 2 per project;
  // the DB is often remote, so every round trip is expensive.
  const projectIds = rows.map((row) => row.id);
  const [fileCounts, cardCounts] = await Promise.all([
    db()
      .select({ projectId: studytraceFile.projectId, value: count() })
      .from(studytraceFile)
      .where(inArray(studytraceFile.projectId, projectIds))
      .groupBy(studytraceFile.projectId),
    db()
      .select({
        projectId: studytraceEvidenceCard.projectId,
        value: count(),
      })
      .from(studytraceEvidenceCard)
      .where(inArray(studytraceEvidenceCard.projectId, projectIds))
      .groupBy(studytraceEvidenceCard.projectId),
  ]);

  const fileCountById = new Map<string, number>(
    fileCounts.map(
      (row: { projectId: string; value: number }) =>
        [row.projectId, row.value] as [string, number]
    )
  );
  const cardCountById = new Map<string, number>(
    cardCounts.map(
      (row: { projectId: string; value: number }) =>
        [row.projectId, row.value] as [string, number]
    )
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    courseName: row.courseName,
    latestTrustScore: row.latestTrustScore,
    lastAnalyzedAt: toIso(row.lastAnalyzedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    fileCount: fileCountById.get(row.id) || 0,
    cardCount: cardCountById.get(row.id) || 0,
  })) satisfies StudyTraceProjectSummary[];
}

export async function findStudyTraceProject(
  projectId: string,
  userId: string
): Promise<StudyTraceProjectRow | undefined> {
  const [row] = await db()
    .select()
    .from(studytraceProject)
    .where(
      and(
        eq(studytraceProject.id, projectId),
        eq(studytraceProject.userId, userId),
        isNull(studytraceProject.deletedAt)
      )
    );

  return row;
}

export async function softDeleteStudyTraceProject(
  projectId: string,
  userId: string
): Promise<boolean> {
  const project = await findStudyTraceProject(projectId, userId);
  if (!project) return false;

  await db()
    .update(studytraceProject)
    .set({
      status: StudyTraceProjectStatus.DELETED,
      deletedAt: new Date(),
    })
    .where(eq(studytraceProject.id, projectId));

  return true;
}

async function getLatestProjectAnalysis(
  projectId: string
): Promise<StudyTraceAnalysis | null> {
  const [run] = await db()
    .select()
    .from(studytraceAnalysisRun)
    .where(eq(studytraceAnalysisRun.projectId, projectId))
    .orderBy(desc(studytraceAnalysisRun.createdAt))
    .limit(1);

  if (!run) return null;

  return {
    trustScore: run.trustScore,
    summary: run.summary,
    riskItems: parseJsonArray(run.riskItems),
    timelineFindings: parseJsonArray(run.timelineFindings),
    evidenceGaps: parseJsonArray(run.evidenceGaps),
    appealOutline: parseJsonArray(run.appealOutline),
    aiBoundaryStatement: run.aiBoundaryStatement,
    exportChecklist: parseJsonArray(run.exportChecklist),
    providerStatus: run.providerStatus,
  };
}

export async function getStudyTraceProjectSnapshot(
  projectId: string,
  userId: string
): Promise<StudyTraceProjectSnapshot | null> {
  const project = await findStudyTraceProject(projectId, userId);
  if (!project) return null;

  // Fetch related rows in parallel; the DB round trip dominates latency.
  const [fileRows, cardRows, timelineRows, analysis] = (await Promise.all([
    db()
      .select()
      .from(studytraceFile)
      .where(eq(studytraceFile.projectId, projectId))
      .orderBy(studytraceFile.createdAt),
    db()
      .select()
      .from(studytraceEvidenceCard)
      .where(eq(studytraceEvidenceCard.projectId, projectId))
      .orderBy(studytraceEvidenceCard.sort),
    db()
      .select()
      .from(studytraceTimelineEvent)
      .where(eq(studytraceTimelineEvent.projectId, projectId))
      .orderBy(studytraceTimelineEvent.sort),
    getLatestProjectAnalysis(projectId),
  ])) as [
    StudyTraceFileRow[],
    StudyTraceCardRow[],
    StudyTraceTimelineRow[],
    Awaited<ReturnType<typeof getLatestProjectAnalysis>>,
  ];

  return {
    project: {
      id: project.id,
      title: project.title,
      courseName: project.courseName,
      institutionPolicy: project.institutionPolicy,
      concern: project.concern,
      aiBoundary: project.aiBoundary,
      settings: parseJsonObject(project.settings, {}),
      status: project.status,
      latestTrustScore: project.latestTrustScore,
      lastAnalyzedAt: toIso(project.lastAnalyzedAt),
      createdAt: toIso(project.createdAt),
      updatedAt: toIso(project.updatedAt),
    },
    files: fileRows.map((row) => ({
      id: row.id,
      name: row.name,
      size: row.size,
      type: row.type,
      extension: row.extension,
      category: row.category,
      lastModified: toIso(row.lastModifiedAt) || '',
      extractedText: row.extractedText || undefined,
      checksum: row.checksum || undefined,
    })),
    cards: cardRows.map((row) => ({
      id: row.id,
      fileId: row.fileId,
      title: row.title,
      kind: row.kind,
      source: row.source,
      summary: row.summary,
      notes: row.notes,
      strength: row.strength,
      proofTarget: row.proofTarget || undefined,
      paperLocator: row.paperLocator || undefined,
      submitStatus: row.submitStatus || undefined,
      actionItems: parseJsonArray(row.actionItems),
      tags: parseJsonArray(row.tags),
      riskFlags: parseJsonArray(row.riskFlags),
    })),
    timeline: timelineRows.map((row) => ({
      id: row.id,
      fileId: row.fileId,
      date: toIso(row.eventAt) || '',
      label: row.label,
      detail: row.detail,
      source: row.source,
      strength: row.strength,
      phase: row.phase || undefined,
      cardIds: parseJsonArray(row.cardIds),
    })),
    analysis,
  };
}

export type SaveStudyTraceSnapshotInput = {
  projectId: string;
  userId: string;
  project: {
    title?: string;
    courseName?: string;
    institutionPolicy?: string;
    concern?: string;
    aiBoundary?: string;
    settings?: unknown;
  };
  files: SnapshotFile[];
  cards: SnapshotCard[];
  timeline: SnapshotTimelineEvent[];
};

/**
 * Persist the full project snapshot transactionally.
 *
 * Child rows (files / cards / timeline) are fully replaced to mirror the
 * front-end autosave model. Incoming ids are preserved so cross-references
 * (card.fileId, event.fileId) stay stable.
 */
export async function saveStudyTraceProjectSnapshot(
  input: SaveStudyTraceSnapshotInput
): Promise<boolean> {
  const { projectId, userId } = input;

  const project = await findStudyTraceProject(projectId, userId);
  if (!project) return false;

  await db().transaction(async (tx: any) => {
    await tx
      .update(studytraceProject)
      .set({
        title: input.project.title ?? project.title,
        courseName: input.project.courseName ?? project.courseName,
        institutionPolicy:
          input.project.institutionPolicy ?? project.institutionPolicy,
        concern: input.project.concern ?? project.concern,
        aiBoundary: input.project.aiBoundary ?? project.aiBoundary,
        settings:
          input.project.settings === undefined
            ? project.settings
            : JSON.stringify(input.project.settings ?? {}),
        updatedAt: new Date(),
      })
      .where(eq(studytraceProject.id, projectId));

    // Full replace of child rows (delete referencing rows before files).
    await tx
      .delete(studytraceEvidenceCard)
      .where(eq(studytraceEvidenceCard.projectId, projectId));
    await tx
      .delete(studytraceTimelineEvent)
      .where(eq(studytraceTimelineEvent.projectId, projectId));
    await tx
      .delete(studytraceFile)
      .where(eq(studytraceFile.projectId, projectId));

    const now = new Date();

    if (input.files.length) {
      await tx.insert(studytraceFile).values(
        input.files.map((file) => ({
          id: file.id || getUuid(),
          projectId,
          userId,
          name: file.name || '',
          size: Number(file.size) || 0,
          type: file.type || '',
          extension: file.extension || '',
          category: file.category || 'writing-process',
          checksum: file.checksum || null,
          extractedText: file.extractedText || null,
          lastModifiedAt: toDate(file.lastModified),
          status: 'active',
          createdAt: now,
          updatedAt: now,
        }))
      );
    }

    const fileIds = new Set(input.files.map((file) => file.id));

    if (input.cards.length) {
      await tx.insert(studytraceEvidenceCard).values(
        input.cards.map((card, index) => ({
          id: card.id || getUuid(),
          projectId,
          userId,
          fileId: card.fileId && fileIds.has(card.fileId) ? card.fileId : null,
          title: card.title || '',
          kind: card.kind || 'appeal',
          source: card.source || '',
          summary: card.summary || '',
          notes: card.notes || '',
          strength: card.strength || 'medium',
          proofTarget: card.proofTarget || '',
          paperLocator: card.paperLocator || '',
          submitStatus: card.submitStatus || '',
          actionItems: JSON.stringify(card.actionItems || []),
          tags: JSON.stringify(card.tags || []),
          riskFlags: JSON.stringify(card.riskFlags || []),
          sort: index,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        }))
      );
    }

    const cardIds = new Set(input.cards.map((card) => card.id));

    if (input.timeline.length) {
      await tx.insert(studytraceTimelineEvent).values(
        input.timeline.map((event, index) => ({
          id: event.id || getUuid(),
          projectId,
          userId,
          fileId:
            event.fileId && fileIds.has(event.fileId) ? event.fileId : null,
          eventAt: toDate(event.date),
          label: event.label || '',
          detail: event.detail || '',
          source: event.source || '',
          strength: event.strength || 'medium',
          phase: event.phase || '',
          cardIds: JSON.stringify(
            (event.cardIds || []).filter((id) => cardIds.has(id))
          ),
          sort: index,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        }))
      );
    }
  });

  return true;
}

/* -------------------------------------------------------------------------- */
/* Report persistence                                                         */
/* -------------------------------------------------------------------------- */

export async function createStudyTraceReport({
  userId,
  projectId,
  analysisRunId,
  title,
  format = 'markdown',
  content,
}: {
  userId: string;
  projectId: string;
  analysisRunId?: string | null;
  title?: string;
  format?: string;
  content: string;
}): Promise<StudyTraceReportRow> {
  const now = new Date();
  const [result] = await db()
    .insert(studytraceReport)
    .values({
      id: getUuid(),
      projectId,
      userId,
      analysisRunId: analysisRunId || null,
      title: title || '',
      format,
      content: content || '',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return result;
}

export async function listStudyTraceReports({
  projectId,
  userId,
  limit = 20,
}: {
  projectId: string;
  userId: string;
  limit?: number;
}): Promise<StudyTraceReportRow[]> {
  return db()
    .select()
    .from(studytraceReport)
    .where(
      and(
        eq(studytraceReport.projectId, projectId),
        eq(studytraceReport.userId, userId),
        eq(studytraceReport.status, 'active')
      )
    )
    .orderBy(desc(studytraceReport.createdAt))
    .limit(limit);
}
