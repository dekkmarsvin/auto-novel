import { client } from './client';

const getNailainPassword = () =>
  client
    .get('site-setting/nailain-password', { cache: 'no-store', retry: 0 })
    .json<{ password: string }>()
    .then((it) => it.password);

const setNailainPassword = (password: string) =>
  client.put('site-setting/nailain-password', { json: { password }, retry: 0 });

export const SiteSettingApi = {
  getNailainPassword,
  setNailainPassword,
};
