import { setRequestLocale } from 'next-intl/server';

import { StudyTraceWorkspace } from '@/shared/blocks/studytrace/workspace';
import { getMetadata } from '@/shared/lib/seo';

export const generateMetadata = getMetadata({
  title: 'StudyTrace - Academic Process Evidence Workspace',
  description:
    'Upload essays and supporting materials, generate evidence cards, build academic timelines, explain risks, and export appeal report drafts.',
  canonicalUrl: '/studytrace',
});

export default async function StudyTracePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <StudyTraceWorkspace />;
}
