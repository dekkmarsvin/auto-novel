import ky from 'ky';

export const AuthUrl = window.location.hostname.includes('fishhawk.top')
  ? 'https://auth.fishhawk.top'
  : 'https://auth.novelia.cc';

const client = ky.create({
  prefixUrl: AuthUrl + '/api/v1',
  timeout: 60000,
  credentials: 'include',
});

const refresh = () =>
  client.post(`auth/refresh`, { searchParams: { app: 'n' } }).text();
const logout = () => client.post(`auth/logout`).text();

export const AuthApi = {
  refresh,
  logout,
};
