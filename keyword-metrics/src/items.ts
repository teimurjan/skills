import { z } from "zod";
import { readJsonAs } from "./read-json.ts";
import { ok, type Result } from "./types.ts";

/** The key names the result in the output file. The query is what Trends searches. */
export type SearchItem = { key: string; query: string };

const Term = z.string().trim().min(1);
const ItemFile = z.array(z.union([Term, z.object({ key: Term, query: Term })]));

const toItem = (entry: string | SearchItem): SearchItem =>
  typeof entry === "string" ? { key: entry, query: entry } : entry;

export const itemsFromTerms = (terms: readonly string[]): SearchItem[] =>
  terms.map((term) => term.trim()).filter((term) => term.length > 0).map(toItem);

export const readItems = async (path: string): Promise<Result<SearchItem[], string>> => {
  const parsed = await readJsonAs(path, ItemFile);
  return parsed.ok ? ok(parsed.value.map(toItem)) : parsed;
};

export const uniqueByKey = (items: readonly SearchItem[]): SearchItem[] => [
  ...new Map(items.map((item) => [item.key, item])).values(),
];
