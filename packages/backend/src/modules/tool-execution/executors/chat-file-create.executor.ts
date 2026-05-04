import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID, createHash } from 'crypto';
import { load as loadHtml } from 'cheerio';
import { AppError } from '../../../middleware/error-handler.js';
import { CHAT_GENERATED_FILES_DIR } from '../../../config/upload.js';

const DEFAULT_MAX_FILES = 8;
const DEFAULT_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_SIZE_BYTES = 8 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  '.txt',
  '.log',
  '.md',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.xls',
  '.xlsx',
  '.css',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.py',
  '.sql',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
]);

const MIME_BY_EXTENSION = new Map<string, string>([
  ['.txt', 'text/plain'],
  ['.log', 'text/plain'],
  ['.md', 'text/markdown'],
  ['.csv', 'text/csv'],
  ['.json', 'application/json'],
  ['.xml', 'application/xml'],
  ['.html', 'text/html'],
  ['.htm', 'text/html'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.css', 'text/css'],
  ['.js', 'application/javascript'],
  ['.jsx', 'application/javascript'],
  ['.mjs', 'application/javascript'],
  ['.cjs', 'application/javascript'],
  ['.ts', 'application/typescript'],
  ['.tsx', 'application/typescript'],
  ['.py', 'text/x-python'],
  ['.sql', 'application/sql'],
  ['.yml', 'application/yaml'],
  ['.yaml', 'application/yaml'],
  ['.toml', 'application/toml'],
  ['.ini', 'text/plain'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
]);

interface ChatFileInputItem {
  name?: unknown;
  mime_type?: unknown;
  content?: unknown;
  content_base64?: unknown;
}

interface ChatFileCreateInput {
  files?: unknown;
}

type SpreadsheetCellValue = string | number | boolean | null;
type SpreadsheetRow = SpreadsheetCellValue[];

const EXCEL_EXTENSIONS = new Set(['.xls', '.xlsx']);
const XLSX_ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const XLS_BINARY_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export interface CreatedChatFileArtifact {
  filename: string;
  storage_filename: string;
  original_name: string;
  mime_type: string;
  kind: 'image' | 'text' | 'file';
  size: number;
  sha256: string;
  text_preview?: string;
}

function toPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function sanitizeOriginalName(value: unknown, index: number): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const basename = path.basename(raw).replace(/[\u0000-\u001f<>:"|?*]+/g, '-').trim();
  const collapsed = basename.replace(/\s+/g, ' ').replace(/^-+|-+$/g, '');
  return collapsed.slice(0, 180) || `file-${index + 1}.txt`;
}

function resolveExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  if (!ext) return '.txt';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError(400, 'UNSUPPORTED_FILE_EXTENSION', `Unsupported generated file extension: ${ext}`);
  }
  return ext;
}

function resolveMimeType(originalName: string, requestedMime: unknown): string {
  const ext = path.extname(originalName).toLowerCase();
  if (isExcelExtension(ext)) {
    return MIME_BY_EXTENSION.get(ext) ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  if (typeof requestedMime === 'string') {
    const mime = requestedMime.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    if (/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mime) && mime.length <= 120) {
      return mime;
    }
  }

  return MIME_BY_EXTENSION.get(path.extname(originalName).toLowerCase()) ?? 'application/octet-stream';
}

function isExcelExtension(ext: string): boolean {
  return EXCEL_EXTENSIONS.has(ext);
}

function resolveKind(mimeType: string): CreatedChatFileArtifact['kind'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (
    mimeType.startsWith('text/')
    || mimeType === 'application/json'
    || mimeType === 'application/xml'
    || mimeType === 'application/javascript'
    || mimeType === 'application/typescript'
    || mimeType === 'application/yaml'
    || mimeType === 'application/toml'
    || mimeType === 'application/sql'
  ) {
    return 'text';
  }
  return 'file';
}

function decodeRawContent(file: ChatFileInputItem): Buffer {
  if (typeof file.content_base64 === 'string' && file.content_base64.trim()) {
    return Buffer.from(file.content_base64.trim(), 'base64');
  }

  if (typeof file.content === 'string') {
    return Buffer.from(file.content, 'utf8');
  }

  return Buffer.alloc(0);
}

function hasPrefix(buffer: Buffer, prefix: Buffer): boolean {
  return buffer.length >= prefix.length && prefix.every((byte, index) => buffer[index] === byte);
}

function isMostlyUtf8Text(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) suspicious += 1;
    if (byte < 0x08 || (byte > 0x0d && byte < 0x20)) suspicious += 1;
  }
  return suspicious / sample.length < 0.05;
}

function normalizeText(value: string): string {
  return value.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseJsonSpreadsheetRows(value: unknown): SpreadsheetRow[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    if (value.every((row) => Array.isArray(row))) {
      return value.map((row) => (row as unknown[]).map(coerceSpreadsheetValue));
    }
    if (value.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
      const headers = Array.from(new Set(value.flatMap((row) => Object.keys(row as Record<string, unknown>))));
      return [
        headers,
        ...value.map((row) => headers.map((header) => coerceSpreadsheetValue((row as Record<string, unknown>)[header]))),
      ];
    }
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['rows', 'data', 'items']) {
      const rows = parseJsonSpreadsheetRows(record[key]);
      if (rows.length > 0) return rows;
    }
  }

  return [];
}

function parseJsonContent(content: string): SpreadsheetRow[] {
  const trimmed = content.trim();
  if (!trimmed || (!trimmed.startsWith('[') && !trimmed.startsWith('{'))) return [];
  try {
    return parseJsonSpreadsheetRows(JSON.parse(trimmed));
  } catch {
    return [];
  }
}

function parseHtmlTableContent(content: string): SpreadsheetRow[] {
  if (!/<table[\s>]/i.test(content)) return [];
  const $ = loadHtml(content);
  const table = $('table').first();
  if (table.length === 0) return [];

  const rows: SpreadsheetRow[] = [];
  table.find('tr').each((_, tr) => {
    const cells: SpreadsheetRow = [];
    $(tr).find('th,td').each((__, cell) => {
      cells.push(coerceSpreadsheetValue($(cell).text().replace(/\s+/g, ' ').trim()));
    });
    if (cells.some((cell) => cell !== null && String(cell).trim() !== '')) rows.push(cells);
  });

  return rows;
}

function splitMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function parseMarkdownTableContent(content: string): SpreadsheetRow[] {
  const lines = normalizeText(content).split('\n').map((line) => line.trim()).filter(Boolean);
  const separatorIndex = lines.findIndex((line) => /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(line));
  if (separatorIndex <= 0) return [];

  const tableLines = [
    lines[separatorIndex - 1],
    ...lines.slice(separatorIndex + 1).filter((line) => line.includes('|')),
  ];

  return tableLines.map((line) => splitMarkdownRow(line).map(coerceSpreadsheetValue));
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function chooseDelimiter(lines: string[]): string | null {
  const candidates = [',', ';', '\t', '|'];
  let best: { delimiter: string; score: number } | null = null;
  for (const delimiter of candidates) {
    const score = lines.slice(0, 20).reduce((total, line) => {
      const cellCount = parseDelimitedLine(line, delimiter).length;
      return total + (cellCount > 1 ? cellCount : 0);
    }, 0);
    if (score > (best?.score ?? 0)) best = { delimiter, score };
  }
  return best && best.score > 0 ? best.delimiter : null;
}

function parseDelimitedContent(content: string): SpreadsheetRow[] {
  const lines = normalizeText(content).split('\n').filter((line) => line.trim());
  if (lines.length === 0) return [];
  const delimiter = chooseDelimiter(lines);
  if (!delimiter) return lines.map((line) => [coerceSpreadsheetValue(line)]);
  return lines.map((line) => parseDelimitedLine(line, delimiter).map(coerceSpreadsheetValue));
}

function coerceSpreadsheetValue(value: unknown): SpreadsheetCellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  const text = String(value).trim();
  if (!text) return '';
  if (/^(true|false)$/i.test(text)) return /^true$/i.test(text);

  const normalizedNumber = text.replace(/\s+/g, '').replace(',', '.');
  if (
    /^[+-]?(?:\d+|\d+\.\d+)$/.test(normalizedNumber)
    && !/^[+-]?0\d/.test(normalizedNumber)
  ) {
    const numberValue = Number(normalizedNumber);
    if (Number.isFinite(numberValue)) return numberValue;
  }

  return text;
}

function extractSpreadsheetRows(content: string): SpreadsheetRow[] {
  const normalized = normalizeText(content);
  const parsers = [
    parseJsonContent,
    parseHtmlTableContent,
    parseMarkdownTableContent,
    parseDelimitedContent,
  ];

  for (const parser of parsers) {
    const rows = parser(normalized);
    if (rows.length > 0) return rows;
  }

  return [['']];
}

function cellToString(value: SpreadsheetCellValue): string {
  if (value === null) return '';
  return String(value);
}

function calculateColumnWidths(rows: SpreadsheetRow[]): number[] {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const maxLength = rows.reduce((max, row) => {
      const value = row[columnIndex];
      return Math.max(max, cellToString(value ?? '').length);
    }, 8);
    return Math.min(Math.max(maxLength + 2, 10), 48);
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnName(index: number): string {
  let value = index;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function xlsxCellXml(value: SpreadsheetCellValue, rowIndex: number, columnIndex: number): string {
  const reference = `${columnName(columnIndex)}${rowIndex}`;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  if (value === null || value === '') {
    return `<c r="${reference}"/>`;
  }
  return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(cellToString(value))}</t></is></c>`;
}

function buildXlsxSheetXml(rows: SpreadsheetRow[]): string {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const widths = calculateColumnWidths(rows)
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join('');
  const sheetViews = rows.length > 1
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const sheetData = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => xlsxCellXml(cell, rowIndex + 1, columnIndex + 1)).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <dimension ref="A1:${columnName(columnCount)}${Math.max(rows.length, 1)}"/>
 ${sheetViews}
 <cols>${widths}</cols>
 <sheetData>${sheetData}</sheetData>
</worksheet>`;
}

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC32_TABLE = buildCrc32Table();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()): { dosDate: number; dosTime: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

// Minimal uncompressed ZIP writer for single-sheet XLSX files.
function createZipArchive(files: Array<{ name: string; data: Buffer }>): Buffer {
  const { dosDate, dosTime } = getDosDateTime();
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const entries: Array<{ name: Buffer; crc: number; size: number; offset: number }> = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = file.data;
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(dosTime, 10);
    header.writeUInt16LE(dosDate, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    localParts.push(header, name, data);
    entries.push({ name, crc: checksum, size: data.length, offset });
    offset += header.length + name.length + data.length;
  }

  let centralSize = 0;
  for (const entry of entries) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(dosTime, 12);
    header.writeUInt16LE(dosDate, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.size, 20);
    header.writeUInt32LE(entry.size, 24);
    header.writeUInt16LE(entry.name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(entry.offset, 42);
    centralParts.push(header, entry.name);
    centralSize += header.length + entry.name.length;
  }

  const centralOffset = offset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function buildXlsxBuffer(rows: SpreadsheetRow[]): Buffer {
  const files = [
    {
      name: '[Content_Types].xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
 <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`, 'utf8'),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`, 'utf8'),
    },
    {
      name: 'xl/workbook.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`, 'utf8'),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`, 'utf8'),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: Buffer.from(buildXlsxSheetXml(rows), 'utf8'),
    },
  ];

  return createZipArchive(files);
}

function buildXlsXmlBuffer(rows: SpreadsheetRow[]): Buffer {
  const columns = calculateColumnWidths(rows)
    .map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${Math.round(width * 7)}"/>`)
    .join('');
  const body = rows.map((row) => {
    const cells = row.map((value) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
      }
      if (typeof value === 'boolean') {
        return `<Cell><Data ss:Type="Boolean">${value ? 1 : 0}</Data></Cell>`;
      }
      return `<Cell><Data ss:Type="String">${escapeXml(cellToString(value))}</Data></Cell>`;
    }).join('');
    return `<Row>${cells}</Row>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Sheet1">
  <Table>${columns}${body}</Table>
 </Worksheet>
</Workbook>`;
  return Buffer.from(xml, 'utf8');
}

async function buildExcelBuffer(ext: string, content: string): Promise<Buffer> {
  const rows = extractSpreadsheetRows(content);
  if (ext === '.xlsx') return buildXlsxBuffer(rows);
  return buildXlsXmlBuffer(rows);
}

async function resolveContentBuffer(file: ChatFileInputItem, ext: string): Promise<Buffer> {
  const hasBase64 = typeof file.content_base64 === 'string' && file.content_base64.trim().length > 0;
  const rawBuffer = decodeRawContent(file);
  if (!isExcelExtension(ext)) return rawBuffer;

  if (hasBase64) {
    if (ext === '.xlsx' && hasPrefix(rawBuffer, XLSX_ZIP_SIGNATURE)) return rawBuffer;
    if (ext === '.xls' && hasPrefix(rawBuffer, XLS_BINARY_SIGNATURE)) return rawBuffer;
    if (!isMostlyUtf8Text(rawBuffer)) return rawBuffer;
    return buildExcelBuffer(ext, rawBuffer.toString('utf8'));
  }

  return buildExcelBuffer(ext, typeof file.content === 'string' ? file.content : '');
}

function buildTextPreview(buffer: Buffer, kind: CreatedChatFileArtifact['kind']): string | undefined {
  if (kind !== 'text') return undefined;
  const preview = buffer.toString('utf8').replace(/\r\n/g, '\n').trim();
  return preview ? preview.slice(0, 400) : undefined;
}

export async function executeChatFileCreate(
  input: ChatFileCreateInput,
  config?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const rawFiles = Array.isArray(input.files) ? input.files : [];
  if (rawFiles.length === 0) {
    throw new AppError(400, 'NO_FILES', 'At least one file is required');
  }

  const maxFiles = Math.min(toPositiveInteger(config?.max_files, DEFAULT_MAX_FILES), DEFAULT_MAX_FILES);
  const maxFileSize = Math.min(
    toPositiveInteger(config?.max_file_size_bytes, DEFAULT_MAX_FILE_SIZE_BYTES),
    DEFAULT_MAX_FILE_SIZE_BYTES,
  );
  const maxTotalSize = Math.min(
    toPositiveInteger(config?.max_total_size_bytes, DEFAULT_MAX_TOTAL_SIZE_BYTES),
    DEFAULT_MAX_TOTAL_SIZE_BYTES,
  );
  const storageDir = typeof config?.storage_dir === 'string' && config.storage_dir.trim()
    ? path.resolve(config.storage_dir)
    : CHAT_GENERATED_FILES_DIR;

  await mkdir(storageDir, { recursive: true });

  const createdFiles: CreatedChatFileArtifact[] = [];
  let totalSize = 0;

  for (const [index, rawFile] of rawFiles.slice(0, maxFiles).entries()) {
    if (!rawFile || typeof rawFile !== 'object') continue;
    const file = rawFile as ChatFileInputItem;
    const originalName = sanitizeOriginalName(file.name, index);
    const ext = resolveExtension(originalName);
    const mimeType = resolveMimeType(originalName, file.mime_type);
    const kind = resolveKind(mimeType);
    const buffer = await resolveContentBuffer(file, ext);

    if (buffer.length === 0) {
      throw new AppError(400, 'EMPTY_FILE', `Generated file is empty: ${originalName}`);
    }
    if (buffer.length > maxFileSize) {
      throw new AppError(400, 'FILE_TOO_LARGE', `Generated file is too large: ${originalName}`);
    }
    if (totalSize + buffer.length > maxTotalSize) {
      throw new AppError(400, 'FILES_TOO_LARGE', 'Generated files exceed the total size limit');
    }

    const storageFilename = `${randomUUID()}${ext}`;
    const filePath = path.join(storageDir, storageFilename);
    await writeFile(filePath, buffer);

    totalSize += buffer.length;
    createdFiles.push({
      filename: storageFilename,
      storage_filename: storageFilename,
      original_name: originalName,
      mime_type: mimeType,
      kind,
      size: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      text_preview: buildTextPreview(buffer, kind),
    });
  }

  if (createdFiles.length === 0) {
    throw new AppError(400, 'NO_VALID_FILES', 'No valid files were provided');
  }

  return {
    files: createdFiles,
    total_size: totalSize,
    note: 'Files were created and will be attached to the final chat response as download cards.',
  };
}
