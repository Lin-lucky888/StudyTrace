import { respData, respErr } from '@/shared/lib/resp';
import { listStudyTraceProjects } from '@/shared/models/studytrace';
import { getUserInfo } from '@/shared/models/user';

export async function POST(req: Request) {
  try {
    let { page, limit } = await req.json().catch(() => ({}));
    if (!page) page = 1;
    if (!limit) limit = 50;

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const projects = await listStudyTraceProjects({
      userId: user.id,
      page,
      limit,
    });

    return respData({ list: projects, page, limit });
  } catch (e: any) {
    console.log('list studytrace projects failed:', e);
    return respErr(`list studytrace projects failed: ${e.message}`);
  }
}
