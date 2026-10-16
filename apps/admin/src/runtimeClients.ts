import ky from 'ky';

// Same public development credential as the user-facing local/native adapter.
const devToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiLmnKzlnLDnlKjmiLciLCJyb2xlIjoiYWRtaW4iLCJjcmF0IjowLCJpYXQiOjB9.U6CwIExYZE7ls8jNeMPCkV8r2h6lOj6F7b3wJ_Ja5iY';

export function createLocalAdminClient(origin: string) {
  return ky.create({
    prefix: new URL('/api/v1/', origin).href,
    retry: { limit: 0 },
    hooks: {
      beforeRequest: [
        ({ request }) => {
          const url = new URL(request.url);
          if (url.origin !== origin || !url.pathname.startsWith('/api/v1/')) {
            throw new Error('本地凭据只能用于本站 API');
          }
          request.headers.set('Authorization', `Bearer ${devToken}`);
        },
      ],
    },
  });
}
