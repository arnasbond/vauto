/**
 * F6 Final — safe CSV/XML bulk import parsers.
 *
 * Deterministic, dependency-free, fail-closed by construction:
 *   - CSV: RFC-4180 subset (quoted fields, escaped quotes, CRLF/LF);
 *     delimiter detection is an EXPLICIT rule (comma wins, then semicolon,
 *     otherwise an error) — never heuristics; UTF-8 is enforced strictly
 *     (fatal decoding) and a UTF-8 BOM is stripped exactly once.
 *   - XML: a strict subset parser. DTD, entity declarations, any `<!`
 *     construct besides comments, and every entity reference beyond the five
 *     predefined ones are REJECTED — external-entity/network resolution is
 *     therefore impossible (there is no resolver at all). Depth/node/attribute
 *     budgets stop entity-expansion and bomb-style documents.
 *   - Spreadsheet formula injection (cells starting with = + - @ or a tab/CR
 *     OLE prefix) is rejected in BOTH formats.
 *   - No invented facts: only the fields present in the file are mapped;
 *     unknown columns/fields are reported as ignored warnings, never guessed.
 */

export const IMPORT_MAX_BYTES = 512 * 1024; // matches the API JSON body limit
export const IMPORT_MAX_ROWS = 100; // aligns with BULK_MAX_TARGETS
export const IMPORT_MAX_FIELDS = 40;
export const IMPORT_MAX_CELL_CHARS = 5000; // description cap
export const XML_MAX_DEPTH = 16;
export const XML_MAX_NODES = 20_000;
export const XML_MAX_ATTRS_PER_ELEMENT = 40;
export const XML_MAX_ATTR_NAME = 200;
export const XML_MAX_ATTR_VALUE = 1000;

export type ParseFailure = { error: string };
export type ParseSuccess<T> = T & { error?: never };

export function decodeUtf8Strict(input: Buffer | string): { text: string } | ParseFailure {
  let buf: Buffer;
  if (typeof input === "string") {
    buf = Buffer.from(input, "utf8");
  } else {
    buf = input;
  }
  if (buf.length > IMPORT_MAX_BYTES) {
    return { error: `Failas per didelis (daugiausia ${IMPORT_MAX_BYTES} baitų).` };
  }
  if (buf.includes(0)) {
    return { error: "Failas turi NUL baitų — importas atmestas." };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { text: text.replace(/^\uFEFF/, "") };
  } catch {
    return { error: "Failo kodavimas nėra UTF-8 — importas atmestas." };
  }
}

/* ------------------------------------------------------------------------ */
/* CSV                                                                      */
/* ------------------------------------------------------------------------ */

export type CsvParseResult =
  | { error: string }
  | {
      headers: string[];
      rows: string[][]; // data rows without the header
      delimiter: "," | ";";
    };

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

export function isFormulaInjectionCell(cell: string): boolean {
  return FORMULA_PREFIXES.some((p) => cell.startsWith(p));
}

/**
 * Deterministic delimiter rule: if the header line contains a comma the
 * delimiter is a comma; otherwise if it contains a semicolon it is a
 * semicolon; otherwise the file is rejected. No other detection happens.
 */
export function parseCsv(input: Buffer | string): CsvParseResult {
  const decoded = decodeUtf8Strict(input);
  if ("error" in decoded) return { error: decoded.error };

  const source = decoded.text;
  if (source.trim().length === 0) {
    return { error: "Failas tuščias." };
  }

  const lines = splitCsvLines(source);
  if (lines.length < 2) {
    return { error: "CSV turi turėti antraštės eilutę ir bent vieną duomenų eilutę." };
  }

  const headerLine = lines[0]!;
  const delimiter: "," | ";" = headerLine.includes(",")
    ? ","
    : headerLine.includes(";")
      ? ";"
      : (null as never);
  if (delimiter === null) {
    return { error: "Nerastas atskyrimo simbolis (kablelis arba kabliataškis) antraštės eilutėje." };
  }

  const headers = parseCsvLine(headerLine, delimiter);
  if ("error" in headers) return { error: `Antraštės eilutė: ${headers.error}` };
  const headerCells = headers.cells.map((c) => c.trim());
  if (headerCells.some((c) => c.length === 0)) {
    return { error: "Antraštės eilutėje yra tuščių stulpelių pavadinimų." };
  }
  if (new Set(headerCells.map((c) => c.toLowerCase())).size !== headerCells.length) {
    return { error: "Antraštės eilutėje yra pasikartojančių stulpelių." };
  }
  if (headerCells.length > IMPORT_MAX_FIELDS) {
    return { error: `Per daug stulpelių (daugiausia ${IMPORT_MAX_FIELDS}).` };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > IMPORT_MAX_ROWS) {
    return { error: `Per daug eilučių (daugiausia ${IMPORT_MAX_ROWS}).` };
  }

  const rows: string[][] = [];
  for (let i = 0; i < dataLines.length; i += 1) {
    const line = dataLines[i]!;
    if (line.trim().length === 0) continue; // blank lines are skipped silently
    const parsed = parseCsvLine(line, delimiter);
    if ("error" in parsed) {
      return { error: `${i + 2} eilutė: ${parsed.error}` };
    }
    if (parsed.cells.length !== headerCells.length) {
      return {
        error: `${i + 2} eilutė: stulpelių skaičius (${parsed.cells.length}) nesutampa su antrašte (${headerCells.length}).`,
      };
    }
    for (const cell of parsed.cells) {
      if (cell.length > IMPORT_MAX_CELL_CHARS) {
        return {
          error: `${i + 2} eilutė: laukas viršija ${IMPORT_MAX_CELL_CHARS} simbolių limitą.`,
        };
      }
      if (isFormulaInjectionCell(cell)) {
        return {
          error: `${i + 2} eilutė: laukas prasideda pavojingu simboliu (=, +, -, @ arba tab) — galima formulių injekcija, eilutė atmesta.`,
        };
      }
    }
    rows.push(parsed.cells);
  }

  if (rows.length === 0) {
    return { error: "Faile nėra duomenų eilučių." };
  }

  return { headers: headerCells, rows, delimiter };
}

/** Split the whole source into logical CSV lines honouring quoted CR/LF. */
function splitCsvLines(source: string): string[] {
  const lines: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (ch === '"') {
      // Toggle quote state; "" escape handled by pairing.
      inQuotes = !inQuotes;
      cur += ch;
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      lines.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

function parseCsvLine(
  line: string,
  delimiter: string
): { cells: string[] } | { error: string } {
  const cells: string[] = [];
  let cur = "";
  let i = 0;
  while (i < line.length) {
    const ch = line[i]!;
    if (ch === '"') {
      // Quoted field: consume until the closing quote; "" inside = literal quote.
      let j = i + 1;
      let field = "";
      let closed = false;
      while (j < line.length) {
        const c = line[j]!;
        if (c === '"') {
          if (line[j + 1] === '"') {
            field += '"';
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        field += c;
        j += 1;
      }
      if (!closed) return { error: "neužbaigtos kabutės." };
      if (line[j] !== undefined && line[j] !== delimiter) {
        return { error: "po uždaromos kabutės leidžiamas tik atskyrimo simbolis." };
      }
      cells.push(field);
      i = j;
      if (line[i] === delimiter) i += 1;
      continue;
    }
    if (ch === delimiter) {
      cells.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  cells.push(cur);
  return { cells };
}

/* ------------------------------------------------------------------------ */
/* XML                                                                      */
/* ------------------------------------------------------------------------ */

export type XmlNode =
  | { kind: "element"; name: string; attributes: Record<string, string>; children: XmlNode[] }
  | { kind: "text"; value: string };

export type XmlParseResult =
  | { error: string }
  | { root: XmlNode; listingNodes: XmlNode[] };

const PREDEFINED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * Strict subset parser. Rejected by construction:
 *   - `<!DOCTYPE`, `<!ENTITY` and any `<!` other than `<!--` comments;
 *   - any entity reference beyond &amp; &lt; &gt; &quot; &apos; (numeric
 *     character references included) — there is NO entity resolver, so
 *     external/network resolution cannot happen;
 *   - processing instructions other than the leading `<?xml ...?>`;
 *   - depth/node/attribute budgets.
 */
export function parseXml(input: Buffer | string): XmlParseResult {
  const decoded = decodeUtf8Strict(input);
  if ("error" in decoded) return { error: decoded.error };
  const src = decoded.text;
  if (src.trim().length === 0) return { error: "Failas tuščias." };

  let pos = 0;
  const len = src.length;
  let nodeCount = 0;

  // Optional leading XML declaration (no DOCTYPE allowed inside it). Only a
  // true declaration — `<?xml` followed by whitespace or `?>` — qualifies;
  // `<?xml-stylesheet …?>` is a processing instruction and is rejected below.
  if (/^<\?xml(\s|\?>)/.test(src)) {
    const end = src.indexOf("?>");
    if (end === -1) return { error: "Netinkama XML deklaracija." };
    const decl = src.slice(0, end + 2).toLowerCase();
    if (decl.includes("doctype")) return { error: "DOCTYPE neleidžiamas." };
    pos = end + 2;
  }

  function skipWhitespace() {
    while (pos < len && /\s/.test(src[pos]!)) pos += 1;
  }

  function parseName(): string | null {
    const m = /^[A-Za-z_][A-Za-z0-9._-]*/.exec(src.slice(pos));
    if (!m) return null;
    pos += m[0].length;
    return m[0];
  }

  function parseEntityRef(): string | null {
    // src[pos] === "&"
    const m = /^&([A-Za-z][A-Za-z0-9]*|#x?[0-9]+);/.exec(src.slice(pos));
    if (!m) return null;
    const name = m[1]!;
    if (name.startsWith("#")) {
      return null; // numeric character references are outside the supported subset
    }
    const resolved = PREDEFINED_ENTITIES[name];
    if (resolved === undefined) return null; // unknown entity — rejected
    pos += m[0].length;
    return resolved;
  }

  function parseText(untilChar?: string): string {
    let out = "";
    while (pos < len) {
      const ch = src[pos]!;
      if (untilChar !== undefined && ch === untilChar) break;
      if (ch === "&") {
        const resolved = parseEntityRef();
        if (resolved === null) {
          throw new Error("Neleidžiama XML esybė (entity) faile.");
        }
        out += resolved;
        continue;
      }
      if (ch === "<") break;
      out += ch;
      pos += 1;
    }
    return out;
  }

  function parseElement(depth: number): XmlNode {
    if (depth > XML_MAX_DEPTH) {
      throw new Error(`XML gylis viršija ${XML_MAX_DEPTH} — dokumentas atmestas.`);
    }
    nodeCount += 1;
    if (nodeCount > XML_MAX_NODES) {
      throw new Error(`XML mazgų skaičius viršija ${XML_MAX_NODES}.`);
    }
    // src[pos] === "<"
    if (src.startsWith("<!--", pos)) {
      const end = src.indexOf("-->", pos);
      if (end === -1) throw new Error("Neuždarytas XML komentaras.");
      if (src.slice(pos, end).includes("--")) throw new Error("Netinkamas XML komentaras.");
      pos = end + 3;
      // A comment is not a node we keep; recurse into the next sibling.
      return parseElement(depth);
    }
    if (src.startsWith("<![CDATA[", pos)) {
      const end = src.indexOf("]]>", pos);
      if (end === -1) throw new Error("Neuždarytas CDATA.");
      const value = src.slice(pos + 9, end);
      pos = end + 3;
      return { kind: "text", value };
    }
    if (src.startsWith("<!", pos) || src.startsWith("<?", pos)) {
      throw new Error("DTD, esybės ir kiti deklaraciniai XML konstruktai neleidžiami.");
    }
    if (src[pos] !== "<") throw new Error("Netikėtas simbolis XML struktūroje.");
    pos += 1; // consume "<"
    const name = parseName();
    if (!name) throw new Error("Trūksta elemento pavadinimo.");
    const attributes: Record<string, string> = {};
    // Attributes: deterministic limit, no entity refs besides predefined.
    for (;;) {
      skipWhitespace();
      if (src[pos] === ">") {
        pos += 1;
        break;
      }
      if (src.startsWith("/>", pos)) {
        pos += 2;
        return { kind: "element", name: name.toLowerCase(), attributes, children: [] };
      }
      const attrName = parseName();
      if (!attrName) throw new Error("Netinkamas atributo pavadinimas.");
      if (attrName.length > XML_MAX_ATTR_NAME) throw new Error("Per ilgas atributo pavadinimas.");
      skipWhitespace();
      if (src[pos] !== "=") throw new Error("Atributui trūksta reikšmės.");
      pos += 1;
      skipWhitespace();
      const quote = src[pos];
      if (quote !== '"' && quote !== "'") throw new Error("Atributo reikšmė turi būti kabutėse.");
      pos += 1;
      let value = "";
      while (pos < len && src[pos] !== quote) {
        const ch = src[pos]!;
        if (ch === "&") {
          const resolved = parseEntityRef();
          if (resolved === null) throw new Error("Neleidžiama XML esybė atributo reikšmėje.");
          value += resolved;
          continue;
        }
        if (ch === "<") throw new Error("Atributo reikšmėje negali būti '<'.");
        value += ch;
        pos += 1;
      }
      if (pos >= len) throw new Error("Neuždaryta atributo reikšmė.");
      pos += 1; // closing quote
      if (value.length > XML_MAX_ATTR_VALUE) throw new Error("Per ilga atributo reikšmė.");
      attributes[attrName.toLowerCase()] = value;
      if (Object.keys(attributes).length > XML_MAX_ATTRS_PER_ELEMENT) {
        throw new Error(`Per daug atributų (daugiausia ${XML_MAX_ATTRS_PER_ELEMENT}).`);
      }
    }
    const children: XmlNode[] = [];
    for (;;) {
      if (pos >= len) throw new Error(`Neuždarytas elementas <${name}>.`);
      if (src.startsWith(`</`, pos)) {
        const endTag = /^<\/\s*([A-Za-z_][A-Za-z0-9._-]*)\s*>/.exec(src.slice(pos));
        if (!endTag) throw new Error(`Netinkama uždarymo žyma elementui <${name}>.`);
        const closeName = endTag[1]!.toLowerCase();
        if (closeName !== name.toLowerCase()) {
          throw new Error(`Uždarymo žyma </${endTag[1]}> neatitinka <${name}>.`);
        }
        pos += endTag[0].length;
        return { kind: "element", name: name.toLowerCase(), attributes, children };
      }
      if (src.startsWith("<!--", pos)) {
        const end = src.indexOf("-->", pos);
        if (end === -1) throw new Error("Neuždarytas XML komentaras.");
        pos = end + 3;
        continue;
      }
      if (src.startsWith("<![CDATA[", pos)) {
        const end = src.indexOf("]]>", pos);
        if (end === -1) throw new Error("Neuždarytas CDATA.");
        children.push({ kind: "text", value: src.slice(pos + 9, end) });
        pos = end + 3;
        continue;
      }
      if (src.startsWith("<!", pos) || src.startsWith("<?", pos)) {
        throw new Error("DTD, esybės ir kiti deklaraciniai XML konstruktai neleidžiami.");
      }
      if (src[pos] === "<") {
        children.push(parseElement(depth + 1));
        continue;
      }
      const text = parseText("<");
      if (text.trim().length > 0) children.push({ kind: "text", value: text });
    }
  }

  try {
    skipWhitespace();
    if (pos >= len) return { error: "Failas neturi XML elemento." };
    const root = parseElement(0);
    skipWhitespace();
    if (pos < len) {
      return { error: "Po šakninio elemento yra papildomų duomenų — atmesta." };
    }
    const listingNodes: XmlNode[] = [];
    if (root.kind === "element" && root.name === "listing") {
      listingNodes.push(root);
    }
    if (root.kind === "element") {
      collectListings(root, listingNodes);
    }
    if (listingNodes.length === 0) {
      return { error: "Nerasta <listing> elementų importui." };
    }
    if (listingNodes.length > IMPORT_MAX_ROWS) {
      return { error: `Per daug <listing> elementų (daugiausia ${IMPORT_MAX_ROWS}).` };
    }
    return { root, listingNodes };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "XML nuskaitymo klaida." };
  }
}

function collectListings(node: XmlNode, out: XmlNode[]): void {
  if (node.kind !== "element") return;
  for (const child of node.children) {
    if (child.kind === "element" && child.name === "listing") out.push(child);
    else if (child.kind === "element") collectListings(child, out);
  }
}
