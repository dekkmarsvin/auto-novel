import ky from 'ky';

const { origin } = window.location;

//  books.kotoban.top => auth.kotoban.top
export const AuthUrl =
  import.meta.env.VITE_API_MODE === 'remote'
    ? `${origin}/auth-proxy`
    : 'https://auth.kotoban.top';

const client = ky.create({
  prefixUrl: AuthUrl + '/api/v1',
  credentials: 'include',
});

export const AuthApi = {
  refresh: (app: string) =>
    client.post(`auth/refresh`, { searchParams: { app } }).text(),
  logout: () => client.post(`auth/logout`).text(),
};
