export const MAX_EXTRACTED_TEXT_LENGTH = 12_000;

function getExtension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

const PLAIN_TEXT_EXTENSIONS = [
  'txt',
  'md',
  'markdown',
  'csv',
  'json',
  'rtf',
  'html',
  'htm',
  'xml',
  'bib',
  'tex',
  'log',
];

function isPlainText(file: File) {
  const ext = getExtension(file.name);
  return file.type.startsWith('text/') || PLAIN_TEXT_EXTENSIONS.includes(ext);
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || getExtension(file.name) === 'pdf';
}

function isDocx(file: File) {
  const ext = getExtension(file.name);
  return (
    ext === 'docx' ||
    file.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

function normalize(text: string, maxLength: number) {
  const trimmed = text.replace(/\u0000/g, '').trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

let pdfWorkerConfigured = false;

async function extractPdfText(file: File, maxLength: number): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist');

  if (!pdfWorkerConfigured) {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
    } catch {
      // Fall back to bundler-resolved default worker if URL resolution fails.
    }
    pdfWorkerConfigured = true;
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  const parts: string[] = [];
  let total = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
      .join(' ');
    parts.push(pageText);
    total += pageText.length;
    if (total >= maxLength) break;
  }

  try {
    await pdf.cleanup?.();
  } catch {
    // ignore cleanup errors
  }

  return normalize(parts.join('\n'), maxLength);
}

async function extractDocxText(file: File, maxLength: number): Promise<string> {
  // The browser build has no bundled type declarations.
  // @ts-expect-error - no types for mammoth browser entry
  const mammoth: any = await import('mammoth/mammoth.browser.js');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return normalize(String(result?.value || ''), maxLength);
}

/**
 * Extract readable text from an uploaded file on the client.
 *
 * Supports plain-text formats, PDF (pdfjs-dist) and DOCX (mammoth). Other
 * binary formats return an empty string (metadata-only). Never throws: on
 * failure it resolves to an empty string so uploads are not blocked.
 */
export async function extractFileText(
  file: File,
  maxLength: number = MAX_EXTRACTED_TEXT_LENGTH
): Promise<string> {
  try {
    if (isPlainText(file)) {
      const text = await file.text();
      return normalize(text, maxLength);
    }
    if (isPdf(file)) {
      return await extractPdfText(file, maxLength);
    }
    if (isDocx(file)) {
      return await extractDocxText(file, maxLength);
    }
  } catch (error) {
    console.warn('StudyTrace extractFileText failed:', file.name, error);
  }
  return '';
}

export function isExtractableDocument(file: File) {
  return isPlainText(file) || isPdf(file) || isDocx(file);
}
