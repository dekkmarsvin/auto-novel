import { DBSchema, openDB } from 'idb';

import { LocalVolumeChapter, LocalVolumeMetadata } from '@/model/LocalVolume';

type Mutator<T> = (value: T) => T;

interface VolumesDBSchema extends DBSchema {
  metadata: {
    key: string;
    value: LocalVolumeMetadata;
  };
  file: {
    key: string;
    value: {
      id: string;
      file: File;
    };
  };
  chapter: {
    key: string;
    value: LocalVolumeChapter;
    indexes: { byVolumeId: string };
  };
}

export const createLocalVolumeDao = async () => {
  const db = await openDB<VolumesDBSchema>('volumes', 2, {
    async upgrade(db, oldVersion, _newVersion, _transaction, _event) {
      if (oldVersion <= 0) {
        db.createObjectStore('metadata', { keyPath: 'id' });
        db.createObjectStore('file', { keyPath: 'id' });
        const store = db.createObjectStore('chapter', { keyPath: 'id' });
        store.createIndex('byVolumeId', 'volumeId');
      }
    },
  });

  // Migrate
  const tx = db.transaction('metadata', 'readwrite');
  for await (const cursor of tx.store) {
    const m = cursor.value;
    if (m.favoredId === undefined) {
      m.favoredId = 'default';
      cursor.update(m);
    }
  }
  await tx.done;

  //Metadata
  const listMetadata = () => db.getAll('metadata');
  const getMetadata = (id: string) => db.get('metadata', id);
  const deleteMetadata = (id: string) => db.delete('metadata', id);
  const createMetadata = (value: LocalVolumeMetadata) =>
    db.put('metadata', value);
  const updateMetadata = async (
    id: string,
    mutator: Mutator<LocalVolumeMetadata>,
  ) => {
    const tx = db.transaction('metadata', 'readwrite');
    let value = await tx.store.get(id);
    if (value !== undefined) {
      value = mutator(value);
      await tx.store.put(value);
    }
    await tx.done;
    return value;
  };

  // File
  const getFile = (id: string) => db.get('file', id);
  const deleteFile = (id: string) => db.delete('file', id);
  const createFile = (id: string, file: File) => db.put('file', { id, file });

  // Chapter
  const getChapter = (id: string, chapterId: string) =>
    db.get('chapter', `${id}/${chapterId}`);
  const createChapter = (chapter: LocalVolumeChapter) =>
    db.put('chapter', chapter);
  const updateChapter = async (
    id: string,
    chapterId: string,
    mutator: Mutator<LocalVolumeChapter>,
  ) => {
    const tx = db.transaction('chapter', 'readwrite');
    let value = await tx.store.get(`${id}/${chapterId}`);
    if (value !== undefined) {
      value = mutator(value);
      await tx.store.put(value);
    }
    await tx.done;
    return value;
  };
  const deleteChapterByVolumeId = async (id: string) => {
    const tx = db.transaction('chapter', 'readwrite');
    for await (const cursor of tx.store.index('byVolumeId').iterate(id)) {
      tx.store.delete(cursor.primaryKey);
    }
    await tx.done;
  };

  return {
    listMetadata,
    getMetadata,
    deleteMetadata,
    createMetadata,
    updateMetadata,
    //
    getFile,
    deleteFile,
    createFile,
    //
    getChapter,
    createChapter,
    updateChapter,
    deleteChapterByVolumeId,
  };
};

export type LocalVolumeDao = Awaited<ReturnType<typeof createLocalVolumeDao>>;
