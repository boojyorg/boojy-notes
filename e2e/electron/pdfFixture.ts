/**
 * A small, valid PDF built in code, so the viewer's specs never carry a
 * binary fixture: one page per entry, its first line as a heading and the
 * rest as body text, in Helvetica (a standard font every reader has, so the
 * words are real text that selects and copies). Landscape (a slide) unless
 * `portrait`.
 */
export function makePdf(pages: string[][], { portrait = false } = {}): Buffer {
  const [w, h] = portrait ? [595, 842] : [720, 405];
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) - 1 + 1; // its object number

  const catalog = add(""); // filled once the page tree's number is known
  const tree = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: number[] = [];
  for (const lines of pages) {
    const [head, ...rest] = lines;
    const ops = [`BT /F1 28 Tf 50 ${h - 70} Td (${esc(head ?? "")}) Tj`];
    for (const line of rest) ops.push(`/F1 16 Tf 0 -34 Td (${esc(line)}) Tj`);
    ops.push("ET");
    const stream = ops.join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${w} ${h}] ` +
          `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objects[tree - 1] =
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
