/**
 * Transport: how we read `data/allt.json`. No knowledge of specific fields —
 * those live in `resources.ts` — and nothing computes over the results here.
 *
 * Server-only: `readAlltFile` uses node:fs. Don't import this from a
 * `"use client"` module.
 *
 * There is no live API anymore — the collector that used to serve one
 * (`server.ts`) was removed along with the rest of the collector. File mode
 * is the only mode.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { AlltFile } from "./types";

/** What the external collector tool writes, relative to the repo root every script runs from. */
const STANDARDEXPORT = "data/allt.json";

let registerFilePathCache: string | undefined;

/**
 * The `allt.json` to read. `SKOLREGISTER_DATA_FILE` wins when set — it can
 * point anywhere. Otherwise `data/allt.json` in the repo root.
 *
 * Resolved once per process. `generateStaticParams` calls this for thousands
 * of pages during `next build`, and the answer cannot change mid-build.
 */
export function registerFilePath(): string {
  if (registerFilePathCache === undefined) {
    registerFilePathCache = process.env.SKOLREGISTER_DATA_FILE ?? STANDARDEXPORT;
  }
  return registerFilePathCache;
}

let registerFileCache: Promise<AlltFile> | null = null;

/**
 * Strips every `raw` field recursively — the doc for `allt.json` measures it
 * at roughly half the parsed file's size, and nothing downstream ever reads
 * it. Done once, right after parse, so the rest of the process holds the
 * smaller tree rather than repeating the strip per read.
 */
function omitRaw(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitRaw);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (key === "raw") continue;
      result[key] = omitRaw(v);
    }
    return result;
  }
  return value;
}

/**
 * Reads and parses `allt.json` once per process, caching the result. Fails
 * loudly and immediately if the file is missing — there is nothing left to
 * fall back to, so a clear "file not found" beats every page failing one at
 * a time with a confusing downstream error.
 */
export function readAlltFile(path: string): Promise<AlltFile> {
  if (!registerFileCache) {
    if (!existsSync(path)) {
      throw new Error(
        `${path} finns inte. Skolregistret behöver en lokal data/allt.json ` +
          `(inte incheckad i repot — se AGENTS.md) för att bygga sidorna. ` +
          `Sätt SKOLREGISTER_DATA_FILE om filen ligger någon annanstans.`,
      );
    }
    registerFileCache = readFile(path, "utf8").then(
      (text) => omitRaw(JSON.parse(text)) as AlltFile,
    );
  }
  return registerFileCache;
}
