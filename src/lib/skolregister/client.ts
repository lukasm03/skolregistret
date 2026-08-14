/**
 * Transport only: how we talk to the skolregister API and how we read a local
 * register export. No knowledge of specific endpoints — those live in
 * `resources.ts`, and anything that computes over the results lives in
 * `statistics.ts`.
 *
 * Server-only: `readRegisterFile` uses node:fs. Don't import this from a
 * `"use client"` module.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { RegisterFile, Sida } from "./types";

const apiBaseUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const PAGE_SIZE = 500;

export async function fetchAllPages<T>(path: string): Promise<T[]> {
  const first = await fetchJson<Sida<T>>(`${path}?sida=1&sidstorlek=${PAGE_SIZE}`);
  const rows = [...first.rader];
  const pages = Math.ceil(first.totalt / first.sidstorlek);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
      fetchJson<Sida<T>>(`${path}?sida=${i + 2}&sidstorlek=${PAGE_SIZE}`),
    ),
  );
  for (const page of rest) rows.push(...page.rader);
  return rows;
}

/**
 * `next build` fires thousands of these concurrently across
 * `generateStaticParams` for every skolenhet, huvudman and koncern — enough
 * that the local dev API drops connections under the burst (`ECONNREFUSED`,
 * `SocketError: other side closed`) even though it's healthy moments later.
 * Retrying with backoff absorbs that instead of failing the whole build.
 */
async function fetchWithRetry(
  url: URL,
  init: RequestInit,
  attempts = 6,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** (attempt - 1)));
    }
  }
}

export async function fetchJson<T>(path: string): Promise<T> {
  const url = new URL(path, apiBaseUrl());
  const res = await fetchWithRetry(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`${url.pathname} svarade ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** `null` when the API reports the resource doesn't exist (404). */
export async function fetchJsonOr404<T>(path: string): Promise<T | null> {
  const url = new URL(path, apiBaseUrl());
  const res = await fetchWithRetry(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 60 },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`${url.pathname} svarade ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** What `bun run export` writes, relative to the repo root every script runs from. */
const STANDARDEXPORT = "data/skolregister-export.json";

let registerFilePathCache: string | null | undefined;

/**
 * The register export to read, or `null` to go via the API instead.
 *
 * `SKOLREGISTER_DATA_FILE` wins when set — it can point anywhere. Otherwise we
 * use the export in the repo, but only once `bun run export` has actually
 * written it: without that check a fresh clone would fail every page rather
 * than fall back to the API.
 *
 * Resolved once per process. `generateStaticParams` calls this for thousands of
 * pages during `next build`, and the answer cannot change mid-build.
 */
export function registerFilePath(): string | null {
  if (registerFilePathCache === undefined) {
    const explicit = process.env.SKOLREGISTER_DATA_FILE;
    registerFilePathCache =
      explicit ?? (existsSync(STANDARDEXPORT) ? STANDARDEXPORT : null);
  }
  return registerFilePathCache;
}

let registerFileCache: Promise<RegisterFile> | null = null;

/** Reads and parses the register export once per process, caching the result. */
export function readRegisterFile(path: string): Promise<RegisterFile> {
  if (!registerFileCache) {
    registerFileCache = readFile(path, "utf8").then(
      (text) => JSON.parse(text) as RegisterFile,
    );
  }
  return registerFileCache;
}
