import { Empty } from '@/shared/blocks/common';
import { SecuritySettings } from '@/shared/blocks/settings/security';
import { getUserInfo } from '@/shared/models/user';

export default async function SecurityPage() {
  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  return <SecuritySettings email={user.email} />;
}
