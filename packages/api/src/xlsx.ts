import { strToU8, zipSync } from "fflate";

// A cell: text, a plain number, or a number shown as a date (an Excel day
// serial) or as an amount with two decimals.
export type XlsxCell =
  | string
  | number
  | { format: "date" | "money"; value: number };

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_RELS_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const SHEET_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const STYLES_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
const DOCUMENT_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Style indexes in styles.xml: 14 is Excel's built-in short date, 2 is 0.00.
const STYLE_INDEX = { date: 1, money: 2 } as const;
const STYLES = `${XML_HEADER}<styleSheet xmlns="${MAIN_NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const LETTERS = 26;
const FIRST_LETTER = 65;
// Days between Excel's epoch (1899-12-30) and the Unix epoch.
const EXCEL_EPOCH_OFFSET_DAYS = 25_569;
const MS_PER_DAY = 86_400_000;
const FIRST_PRINTABLE_CODE = 32;
const XML_WHITESPACE = new Set(["\t", "\n", "\r"]);
const XML_ESCAPES = /[&<>"]/g;
const ESCAPED: Record<string, string> = {
  '"': "&quot;",
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

// XML 1.0 forbids control characters other than whitespace, even escaped.
const isXmlCharacter = (character: string) =>
  XML_WHITESPACE.has(character) ||
  character.charCodeAt(0) >= FIRST_PRINTABLE_CODE;

const escapeXml = (value: string) =>
  Array.from(value)
    .filter(isXmlCharacter)
    .join("")
    .replace(XML_ESCAPES, (character) => ESCAPED[character] ?? character);

const columnName = (index: number): string => {
  const letter = String.fromCharCode(FIRST_LETTER + (index % LETTERS));
  return index < LETTERS
    ? letter
    : `${columnName(Math.floor(index / LETTERS) - 1)}${letter}`;
};

// The Excel serial of a calendar day, without any time zone shift.
export const excelDay = (year: number, month: number, day: number) =>
  Date.UTC(year, month - 1, day) / MS_PER_DAY + EXCEL_EPOCH_OFFSET_DAYS;

const cellXml = (cell: XlsxCell, reference: string) => {
  if (typeof cell === "string") {
    return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
  }
  if (typeof cell === "number") {
    return `<c r="${reference}"><v>${cell}</v></c>`;
  }
  return `<c r="${reference}" s="${STYLE_INDEX[cell.format]}"><v>${cell.value}</v></c>`;
};

// A one-sheet workbook, written as the minimal set of Office Open XML parts
// every spreadsheet and import tool reads.
export function xlsxFile(
  rows: XlsxCell[][],
  options: { fileName: string; sheetName: string }
) {
  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) =>
          cellXml(cell, `${columnName(columnIndex)}${rowIndex + 1}`)
        )
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const zipped = zipSync({
    "_rels/.rels": strToU8(
      `${XML_HEADER}<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${DOCUMENT_TYPE}" Target="xl/workbook.xml"/></Relationships>`
    ),
    "[Content_Types].xml": strToU8(
      `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${XML_HEADER}<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${SHEET_TYPE}" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${STYLES_TYPE}" Target="styles.xml"/></Relationships>`
    ),
    "xl/styles.xml": strToU8(STYLES),
    "xl/workbook.xml": strToU8(
      `${XML_HEADER}<workbook xmlns="${MAIN_NS}" xmlns:r="${DOC_RELS_NS}"><sheets><sheet name="${escapeXml(options.sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `${XML_HEADER}<worksheet xmlns="${MAIN_NS}"><sheetData>${sheetRows}</sheetData></worksheet>`
    ),
  });
  return new File([zipped], options.fileName, { type: XLSX_MIME_TYPE });
}
