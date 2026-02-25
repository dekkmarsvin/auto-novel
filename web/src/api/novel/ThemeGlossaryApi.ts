import { client } from './client';
import type { ThemeGlossaryDto } from '../../model/ThemeGlossary';
import type { Glossary } from '../../model/Glossary';

export namespace ThemeGlossaryApi {
  export const list = async (): Promise<ThemeGlossaryDto[]> => {
    return client.get('theme-glossary').json<ThemeGlossaryDto[]>();
  };

  export const create = async (
    name: string,
    glossary: Glossary,
  ): Promise<string> => {
    return client.post('theme-glossary', { json: { name, glossary } }).text();
  };

  export const update = async (
    id: string,
    name: string,
    glossary: Glossary,
  ): Promise<void> => {
    return client
      .put(`theme-glossary/${id}`, { json: { name, glossary } })
      .json<void>();
  };

  export const deleteGlossary = async (id: string): Promise<void> => {
    return client.delete(`theme-glossary/${id}`).json<void>();
  };
}
