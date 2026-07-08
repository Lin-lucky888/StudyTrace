'use client';

import { useCallback, useEffect, useState } from 'react';
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

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
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

export function StudyTraceProjects() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState('');

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
        setProjects(result.data?.list || []);
      } else {
        setAuthed(false);
      }
    } catch {
      setAuthed(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        router.push(`/studytrace/${result.data.project.id}`);
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
      !window.confirm('确定删除这个项目？删除后无法恢复。')
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
          正在加载...
        </div>
      </main>
    );
  }

  // Guest mode: keep the local (localStorage) workspace usable without sign-in.
  if (!authed) {
    return (
      <div>
        <div className="bg-primary/5 border-b">
          <div className="container flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="text-primary mt-0.5 size-5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  当前为本地草稿模式，材料只保存在本浏览器。
                </p>
                <p className="text-muted-foreground text-sm">
                  登录后可创建多个云端项目，跨设备保存证据、时间线与申诉报告。
                </p>
              </div>
            </div>
            <Button asChild className="shrink-0">
              <Link href="/sign-in">
                <LogIn className="size-4" />
                登录以云端保存
              </Link>
            </Button>
          </div>
        </div>
        <StudyTraceWorkspace />
      </div>
    );
  }

  return (
    <main className="bg-muted/20 min-h-dvh">
      <section className="bg-background border-b">
        <div className="container flex flex-col gap-5 py-6 md:flex-row md:items-end md:justify-between md:py-8">
          <div className="max-w-3xl space-y-3">
            <Badge variant="outline" className="gap-2">
              <ShieldCheck className="size-3.5" />
              StudyTrace
            </Badge>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-normal md:text-4xl">
                我的项目
              </h1>
              <p className="text-muted-foreground text-sm leading-6 md:text-base">
                每个项目对应一份作业的写作过程证据、时间线和申诉报告。
              </p>
            </div>
          </div>
          <Button onClick={createProject} disabled={isCreating}>
            {isCreating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            新建项目
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
                      {project.title || '未命名项目'}
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
                    {project.courseName || '未填写课程'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <FileText className="size-3.5" />
                      {project.fileCount} 文件
                    </span>
                    <span className="flex items-center gap-1">
                      <Sparkles className="size-3.5" />
                      {project.cardCount} 证据卡
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    更新于 {formatDate(project.updatedAt)}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/studytrace/${project.id}`}>
                        打开
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="删除项目"
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
              <p className="font-medium">还没有项目</p>
              <p className="text-muted-foreground text-sm">
                新建一个项目，开始整理写作过程证据与申诉材料。
              </p>
            </div>
            <Button onClick={createProject} disabled={isCreating}>
              {isCreating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              新建项目
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
