import { client } from './client';

const getNailainPassword = () =>
  client
    .get('site-setting/nailain-password')
    .json<{ password: string }>()
    .then((it) => it.password);

const setNailainPassword = (password: string) =>
  client.put('site-setting/nailain-password', { json: { password } });

export const SiteSettingApi = {
  getNailainPassword,
  setNailainPassword,
};
