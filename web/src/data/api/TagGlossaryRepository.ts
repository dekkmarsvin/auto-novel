import { client } from './client';

export interface TagGlossary {
  id: string;
  tag: string;
  glossary: { [key: string]: string };
  adminOnly: boolean;
}

const list = () => client.get('tag-glossary').json<TagGlossary[]>();

const create = (json: {
  tag: string;
  glossary: { [key: string]: string };
  adminOnly: boolean;
}) => client.post('tag-glossary', { json }).text();

const update = (
  id: string,
  json: { glossary: { [key: string]: string }; adminOnly?: boolean },
) => client.put(`tag-glossary/${id}`, { json });

const remove = (id: string) => client.delete(`tag-glossary/${id}`);

export const TagGlossaryRepository = {
  list,
  create,
  update,
  remove,
};
