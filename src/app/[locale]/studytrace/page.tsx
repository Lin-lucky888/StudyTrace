import type { Metadata } from 'next';

import { StudyTraceWorkbench } from '@/shared/blocks/studytrace';

export const metadata: Metadata = {
  title: 'StudyTrace Academic Evidence Chain Workbench',
  description:
    'A browser-only MVP for citation verification, AI use explanation, appeal evidence timelines, and report export.',
};

export default function StudyTracePage() {
  return <StudyTraceWorkbench />;
}
