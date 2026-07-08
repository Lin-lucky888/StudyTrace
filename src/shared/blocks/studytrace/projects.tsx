'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  FileText,
  Loader2,
  LogIn,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';

import { StudyTraceWorkspace } from './workspace';

type ProjectSummary = {
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

function formatDate(value: string | null, locale: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function scoreTone(score: number) {
  if (score >= 75) return 'text-green-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function getLocalizedPath(path: string, locale: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${normalizedPath}`;
}

// Guest workspace storage key (must match STORAGE_KEY in workspace.tsx).
const GUEST_STORAGE_KEY = 'studytrace-workspace-v1';

function readGuestSnapshot(): Record<string, any> | null {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const hasContent =
      data?.assignmentTitle ||
      (Array.isArray(data?.files) && data.files.length) ||
      (Array.isArray(data?.cards) && data.cards.length) ||
      (Array.isArray(data?.timeline) && data.timeline.length);
    return hasContent ? data : null;
  } catch {
    return null;
  }
}

/**
 * Migrate guest (localStorage) workspace data into a cloud project after
 * sign-in, so users don't lose work done before creating an account.
 */
async function migrateGuestSnapshot(): Promise<string | null> {
  const data = readGuestSnapshot();
  if (!data) return null;

  const createResponse = await fetch('/api/studytrace/projects/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: data.assignmentTitle || '' }),
  });
  const createResult = await createResponse.json();
  const projectId = createResult?.data?.project?.id;
  if (!createResponse.ok || createResult.code !== 0 || !projectId) {
    return null;
  }

  const saveResponse = await fetch('/api/studytrace/projects/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      project: {
        title: data.assignmentTitle || '',
        courseName: data.courseName || '',
        institutionPolicy: data.institutionPolicy || '',
        concern: data.concern || '',
        aiBoundary: data.aiBoundary || '',
        settings: {
          ...(data.settings && typeof data.settings === 'object'
            ? data.settings
            : {}),
          submittedAt: data.submittedAt || '',
        },
      },
      files: Array.isArray(data.files) ? data.files : [],
      cards: Array.isArray(data.cards) ? data.cards : [],
      timeline: Array.isArray(data.timeline) ? data.timeline : [],
    }),
  });
  const saveResult = await saveResponse.json();
  if (!saveResponse.ok || saveResult.code !== 0) {
    return null;
  }

  localStorage.removeItem(GUEST_STORAGE_KEY);
  return projectId;
}

export function StudyTraceProjects() {
  const router = useRouter();
  const t = useTranslations('studytrace');
  const locale = useLocale();
  const [isLoading, setIsLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const migrationRanRef = useRef(false);

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/studytrace/projects/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (response.ok && result.code === 0) {
        setAuthed(true);
        let list: ProjectSummary[] = result.data?.list || [];

        // One-shot: pull guest localStorage work into a cloud project.
        if (!migrationRanRef.current && readGuestSnapshot()) {
          migrationRanRef.current = true;
          try {
            const migratedId = await migrateGuestSnapshot();
            if (migratedId) {
              toast.success(t('projects.guestMigrated'));
              const refreshed = await fetch('/api/studytrace/projects/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              });
              const refreshedResult = await refreshed.json();
              if (refreshed.ok && refreshedResult.code === 0) {
                list = refreshedResult.data?.list || list;
              }
            }
          } catch {
            // Guest data stays in localStorage; retried on next visit.
            migrationRanRef.current = false;
          }
        }

        setProjects(list);
      } else {
        setAuthed(false);
      }
    } catch {
      setAuthed(false);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const createProject = async () => {
    setIsCreating(true);
    try {
      const response = await fetch('/api/studytrace/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      });
      const result = await response.json();
      if (response.ok && result.code === 0 && result.data?.project?.id) {
        router.push(
          getLocalizedPath(`/studytrace/${result.data.project.id}`, locale)
        );
        return;
      }
    } catch {
      // ignore, reset below
    }
    setIsCreating(false);
  };

  const deleteProject = async (id: string) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(t('projects.deleteConfirm'))
    ) {
      return;
    }
    setDeletingId(id);
    try {
      const response = await fetch('/api/studytrace/projects/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      });
      const result = await response.json();
      if (response.ok && result.code === 0) {
        setProjects((prev) => prev.filter((project) => project.id !== id));
      }
    } catch {
      // ignore
    } finally {
      setDeletingId('');
    }
  };

  if (isLoading) {
    return (
      <main className="bg-muted/20 flex min-h-dvh items-center justify-center">
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          <Loader2 className="size-5 animate-spin" />
          {t('projects.loading')}
        </div>
      </main>
    );
  }

  // Guest mode: keep the local (localStorage) workspace usable without sign-in.
  if (!authed) {
    return (
      <div className="pt-[72px] max-lg:pt-14">
        <div className="bg-primary/5 border-b">
          <div className="container flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="text-primary mt-0.5 size-5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t('projects.guestTitle')}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t('projects.guestDesc')}
                </p>
              </div>
            </div>
            <Button asChild className="shrink-0">
              <Link href={getLocalizedPath('/sign-in', locale)}>
                <LogIn className="size-4" />
                {t('projects.guestSignIn')}
              </Link>
            </Button>
          </div>
        </div>
        <StudyTraceWorkspace embedded />
      </div>
    );
  }

  return (
    <main className="bg-muted/20 min-h-dvh pt-[72px] max-lg:pt-14">
      <section className="bg-background border-b">
        <div className="container flex flex-col gap-5 py-6 md:flex-row md:items-end md:justify-between md:py-8">
          <div className="max-w-3xl space-y-3">
            <Badge variant="outline" className="gap-2">
              <ShieldCheck className="size-3.5" />
              {t('common.badge')}
            </Badge>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-normal md:text-4xl">
                {t('projects.title')}
              </h1>
              <p className="text-muted-foreground text-sm leading-6 md:text-base">
                {t('projects.subtitle')}
              </p>
            </div>
          </div>
          <Button onClick={createProject} disabled={isCreating}>
            {isCreating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {t('projects.newProject')}
          </Button>
        </div>
      </section>

      <section className="container py-6">
        {projects.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="group flex flex-col rounded-lg transition-shadow hover:shadow-md"
              >
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="line-clamp-2 text-base">
                      {project.title || t('projects.unnamed')}
                    </CardTitle>
                    <span
                      className={cn(
                        'shrink-0 text-lg font-semibold',
                        scoreTone(project.latestTrustScore)
                      )}
                    >
                      {project.latestTrustScore}
                      <span className="text-muted-foreground text-xs font-normal">
                        /100
                      </span>
                    </span>
                  </div>
                  <CardDescription className="line-clamp-1">
                    {project.courseName || t('projects.noCourse')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <FileText className="size-3.5" />
                      {t('projects.fileCount', { count: project.fileCount })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Sparkles className="size-3.5" />
                      {t('projects.cardCount', { count: project.cardCount })}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t('projects.updatedAt', {
                      date: formatDate(project.updatedAt, locale),
                    })}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link
                        href={getLocalizedPath(
                          `/studytrace/${project.id}`,
                          locale
                        )}
                      >
                        {t('projects.open')}
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t('projects.deleteAria')}
                      disabled={deletingId === project.id}
                      onClick={() => deleteProject(project.id)}
                    >
                      {deletingId === project.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="bg-background flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-12 text-center">
            <div className="bg-muted/40 rounded-md border p-3">
              <FileText className="text-primary size-8" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">{t('projects.emptyTitle')}</p>
              <p className="text-muted-foreground text-sm">
                {t('projects.emptyDesc')}
              </p>
            </div>
            <Button onClick={createProject} disabled={isCreating}>
              {isCreating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              {t('projects.newProject')}
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
