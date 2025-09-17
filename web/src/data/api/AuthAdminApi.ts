import { isLegacyHost, officialBaseDomain } from '@/util/origin';
import { Page } from '@/model/Page';
import { UserRole } from '@/model/User';
import { client } from './client';

const baseDomain = isLegacyHost ? 'fishhawk.top' : officialBaseDomain;
export const AuthUrl = `https://auth.${baseDomain}`;

const clientAuth = client.extend({
  prefixUrl: AuthUrl + '/api/v1',
  credentials: 'include',
});

export interface UserInfo {
  username: string;
  email: string;
  role: UserRole;
  createdAt: number;
  lastLogin: number;
  attr: object;
}

const listUser = (params: { page: number; pageSize: number; role: UserRole }) =>
  clientAuth.get('user', { searchParams: params }).json<Page<UserInfo>>();

interface RestrictUserRequest {
  username: string;
  role: UserRole;
}

const restrictUser = (json: RestrictUserRequest) =>
  clientAuth.post(`user/restrict`, { json });

interface BanUserRequest {
  username: string;
  role: UserRole;
}

const banUser = (json: BanUserRequest) => clientAuth.post(`user/ban`, { json });

interface StrikeUserRequest {
  username: string;
  reason: string;
  evidence: string;
}

const strikeUser = (json: StrikeUserRequest) =>
  clientAuth.post(`user/strike`, { json });

export const AuthAdminApi = {
  listUser,
  restrictUser,
  banUser,
  strikeUser,
};
