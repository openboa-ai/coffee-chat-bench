import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  opendirSync,
  readSync,
} from "node:fs";
import type { Dirent } from "node:fs";

const utf8 = new TextDecoder("utf-8", { fatal: true });

export function* readDirectoryEntries(path: string): IterableIterator<Dirent> {
  const directory = opendirSync(path);
  try {
    while (true) {
      const entry = directory.readSync();
      if (entry === null) return;
      yield entry;
    }
  } finally {
    directory.closeSync();
  }
}

export function readUtf8File(
  path: string,
  label: string,
  maxBytes: number,
): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError(`${label} has an invalid byte limit`);
  }

  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) {
      throw new TypeError(`${label} must be a regular file`);
    }
    if (before.size > BigInt(maxBytes)) {
      throw new TypeError(`${label} exceeds ${maxBytes} byte limit`);
    }

    const bytes = Buffer.allocUnsafe(maxBytes + 1);
    let bytesRead = 0;
    while (bytesRead < bytes.length) {
      const count = readSync(
        descriptor,
        bytes,
        bytesRead,
        bytes.length - bytesRead,
        null,
      );
      if (count === 0) break;
      bytesRead += count;
    }

    const after = fstatSync(descriptor, { bigint: true });
    if (bytesRead > maxBytes || after.size > BigInt(maxBytes)) {
      throw new TypeError(`${label} exceeds ${maxBytes} byte limit`);
    }
    if (
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      BigInt(bytesRead) !== after.size
    ) {
      throw new TypeError(`${label} changed while being read`);
    }

    try {
      return utf8.decode(bytes.subarray(0, bytesRead));
    } catch (error) {
      throw new TypeError(
        `${label} must be valid UTF-8: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
