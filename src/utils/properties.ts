import { isMap, isScalar, isSeq, parseDocument } from "yaml";

/**
 * A note's properties: the YAML in its frontmatter block, read with the `yaml`
 * library and never written by it. YAML that does not read cleanly (a parse
 * error, a duplicate key, a root that is not a map) has no properties.
 */

/**
 * One top-level property's value as plain data: a scalar's value, a list's
 * scalar items (`undefined` for anything else in it), or `undefined` when the
 * key is absent, its value is a map, or the YAML does not read.
 */
export function propertyValue(text: string, key: string): unknown {
  if (!text?.includes(key)) return undefined;
  const doc = parseDocument(text);
  if (doc.errors.length || !isMap(doc.contents)) return undefined;
  const node: unknown = doc.contents.get(key, true);
  if (isScalar(node)) return node.value;
  if (isSeq(node)) return node.items.map((item) => (isScalar(item) ? item.value : undefined));
  return undefined;
}
