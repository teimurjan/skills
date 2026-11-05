import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** Writes to a temp file in the same directory, then renames, so readers never see a partial file. */
export const writeFileAtomic = async (path: string, content: string): Promise<void> => {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.${basename(path)}.${randomUUID()}.tmp`);
  await writeFile(temp, content);
  await rename(temp, path);
};
