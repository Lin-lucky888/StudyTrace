import { setRequestLocale } from 'next-intl/server';

import { StudyTraceProjects } from '@/shared/blocks/studytrace/projects';
import { getMetadata } from '@/shared/lib/seo';

export const generateMetadata = getMetadata({
  title: 'StudyTrace - My Projects',
  description:
    'Manage your academic process evidence projects: upload materials, generate evidence cards, build timelines, explain risks, and export appeal report drafts.',
  canonicalUrl: '/studytrace',
});

export default async function StudyTracePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <StudyTraceProjects />;
}
