import { respData, respErr } from '@/shared/lib/resp';
import {
  findStudyTraceProject,
  listStudyTraceReports,
} from '@/shared/models/studytrace';
import { getUserInfo } from '@/shared/models/user';

export async function POST(req: Request) {
  try {
    const { projectId, limit } = await req.json().catch(() => ({}));
    if (!projectId) {
      return respErr('projectId is required');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const project = await findStudyTraceProject(projectId, user.id);
    if (!project) {
      return respErr('project not found');
    }

    const reports = await listStudyTraceReports({
      projectId,
      userId: user.id,
      limit: limit || 20,
    });

    return respData({
      list: reports.map((report) => ({
        id: report.id,
        title: report.title,
        format: report.format,
        content: report.content,
        createdAt:
          report.createdAt instanceof Date
            ? report.createdAt.toISOString()
            : report.createdAt,
      })),
    });
  } catch (e: any) {
    console.log('list studytrace reports failed:', e);
    return respErr(`list studytrace reports failed: ${e.message}`);
  }
}
