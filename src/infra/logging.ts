import { mkdir, appendFile } from 'node:fs/promises';
import * as path from 'node:path';

const ensureDir = async (dirPath: string): Promise<void> => {
  await mkdir(dirPath, { recursive: true });
};

const formatLogEntry = (message: string): string => {
  const ts = new Date().toISOString();

  return `[${ts}] ${message}\n`;
};

export const appendFirebatLog = async (rootAbs: string, relativePath: string, message: string): Promise<void> => {
  const filePath = path.resolve(rootAbs, relativePath);
  const dirPath = path.dirname(filePath);

  await ensureDir(dirPath);
  await appendFile(filePath, formatLogEntry(message), 'utf8');
};
