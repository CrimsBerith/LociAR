/** Reads one quoted CSV field that starts after the opening quote; `end` is the closing quote's index. */
function readQuoted(text: string, start: number): { value: string; end: number } {
  let value = '';
  let i = start;
  while (i < text.length) {
    if (text[i] !== '"') value += text[i];
    else if (text[i + 1] === '"') { value += '"'; i++; }
    else return { value, end: i };
    i++;
  }
  throw new Error('CSV contains an unclosed quoted field');
}

/** RFC 4180-style rows: quoted fields with doubled quotes, LF or CRLF line ends. Blank rows are dropped. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => {
    endCell();
    if (row.some(value => value.trim())) rows.push(row);
    row = [];
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' && cell === '') {
      const field = readQuoted(text, i + 1);
      cell = field.value;
      i = field.end;
    } else if (ch === ',') endCell();
    else if (ch === '\n') endRow();
    else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else cell += ch;
    i++;
  }
  endRow();
  return rows;
}
