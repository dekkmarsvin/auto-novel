import type { Glossary } from '@/model/Glossary';

export interface ThemeGlossaryDto {
  id: string;
  name: string;
  glossary: Glossary;
  createAt: number;
  updateAt: number;
}
