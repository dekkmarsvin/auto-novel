import { isLegacyHost, officialBaseDomain } from '@/util/origin';
import ky from 'ky';

export const AuthUrl = isLegacyHost
  ? 'https://auth.fishhawk.top'
  : `https://auth.${officialBaseDomain}`;

const client = ky.create({
  prefixUrl: AuthUrl + '/api/v1',
  credentials: 'include',
});

export const AuthApi = {
  refresh: (app: string) =>
    client.post(`auth/refresh`, { searchParams: { app } }).text(),
  logout: () => client.post(`auth/logout`).text(),
};
