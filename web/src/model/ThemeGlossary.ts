import type { Glossary } from '@/model/Glossary';

export interface ThemeGlossaryDto {
  id: string;
  name: string;
  glossary: Glossary;
  authorUsername: string;
  createAt: number;
  updateAt: number;
}
