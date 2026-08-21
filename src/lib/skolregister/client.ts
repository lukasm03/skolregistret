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
 * Reads and parses `allt.json` once per process, caching the result. Fails
 * loudly and immediately if the file is missing — there is nothing left to
 * fall back to, so a clear "file not found" beats every page failing one at
 * a time with a confusing downstream error.
 *
 * The `raw` fields are dropped in a `JSON.parse` reviver rather than by
 * walking the parsed tree afterwards: a post-parse walk builds a complete
 * second tree before handing it back, so peak memory was the 226 MB source
 * string plus two full trees (~874 MB RSS). A reviver runs bottom-up as the
 * one tree is being built — each `raw` value is discarded before its parent
 * object ever holds it.
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
      (text) =>
        JSON.parse(text, (key, value) => (key === "raw" ? undefined : value)) as AlltFile,
    );
  }
  return registerFileCache;
}
