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
    // Ktor returns an empty success response for Unit; there is no JSON to parse.
    await client.put(`theme-glossary/${id}`, { json: { name, glossary } });
  };

  export const deleteGlossary = async (id: string): Promise<void> => {
    await client.delete(`theme-glossary/${id}`);
  };
}
