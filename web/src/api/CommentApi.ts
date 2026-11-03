import { createForumApi } from '@novelia/web-kit/forum';

import { community } from '@/config';
import { lazyCommunityApi } from '@/community';
import { webKit } from '@/webKit';

export const CommentApi = lazyCommunityApi(community, () =>
  createForumApi({
    client: webKit.createClient(community.url, { timeout: 60_000 }),
    url: community.url,
    type: 'novel',
  }),
);
