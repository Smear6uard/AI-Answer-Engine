import mammoth from 'mammoth';
import { extractText } from 'unpdf';

export interface ParsedDocument {
  content: string;
  type: 'pdf' | 'docx' | 'doc';
  pageCount?: number;
  error?: string;
  scraperUsed?: string;
}

const MAX_CONTENT_LENGTH = 50000;

function validateBuffer(buffer: Buffer): { valid: boolean; error?: string } {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { valid: false, error: 'Invalid buffer: not a Buffer instance' };
  }
  if (buffer.length === 0) {
    return { valid: false, error: 'Invalid buffer: buffer is empty' };
  }
  if (buffer.length < 4 || buffer.toString('ascii', 0, 4) !== '%PDF') {
    return { valid: false, error: 'Invalid PDF: buffer does not start with PDF header' };
  }
  return { valid: true };
}
async function parsePDFWithUnpdf(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const uint8Array = new Uint8Array(buffer);
    const result = await extractText(uint8Array);
    
    let text: string;
    let metadata: { pages?: number };

    if (typeof result === 'string') {
      text = result;
      metadata = {};
    } else if (result && typeof result === 'object') {
      const rawText = result.text || '';
      metadata = { pages: result.totalPages };

      if (Array.isArray(rawText)) {
        text = rawText.join('\n');
      } else if (typeof rawText !== 'string') {
        text = String(rawText);
      } else {
        text = rawText;
      }
    } else {
      text = String(result || '');
      metadata = {};
    }
    
    const trimmedText = text.trim();
    
    if (!trimmedText || trimmedText.length === 0) {
      return {
        content: '',
        type: 'pdf',
        error: 'PDF appears to be empty or contains no extractable text (may be image-based/scanned PDF)',
        scraperUsed: 'unpdf',
      };
    }
    
    let content = trimmedText
      .replace(/\s+/g, ' ')
      .slice(0, MAX_CONTENT_LENGTH);

    if (trimmedText.length > MAX_CONTENT_LENGTH) {
      content += '\n\n[Content truncated due to length]';
    }

    return {
      content,
      type: 'pdf',
      pageCount: metadata?.pages || undefined,
      scraperUsed: 'unpdf',
    };
  } catch (error) {
    console.error('PDF parsing error:', error);
    return {
      content: '',
      type: 'pdf',
      error: `unpdf failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      scraperUsed: 'unpdf',
    };
  }
}

export async function parsePDF(buffer: Buffer): Promise<ParsedDocument> {
  const validation = validateBuffer(buffer);
  if (!validation.valid) {
    return {
      content: '',
      type: 'pdf',
      error: validation.error || 'Invalid PDF buffer',
      scraperUsed: 'unpdf',
    };
  }
  
  return await parsePDFWithUnpdf(buffer);
}

export async function parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const result = await mammoth.extractRawText({ buffer });

    let content = result.value
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_CONTENT_LENGTH);

    if (result.value.length > MAX_CONTENT_LENGTH) {
      content += '\n\n[Content truncated due to length]';
    }

    if (result.messages.length > 0) {
      console.warn('DOCX parsing warnings:', result.messages);
    }

    return {
      content,
      type: 'docx',
    };
  } catch (error) {
    console.error('DOCX parsing error:', error);
    return {
      content: '',
      type: 'docx',
      error: error instanceof Error ? error.message : 'Failed to parse DOCX',
    };
  }
}

export function getDocumentType(url: string): 'pdf' | 'docx' | 'doc' | null {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith('.pdf')) return 'pdf';
  if (lowerUrl.endsWith('.docx')) return 'docx';
  if (lowerUrl.endsWith('.doc')) return 'doc';
  return null;
}

export async function parseDocumentFromURL(url: string): Promise<ParsedDocument | null> {
  const docType = getDocumentType(url);
  if (!docType) return null;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return {
        content: '',
        type: docType,
        error: `Failed to fetch document: ${response.status}`,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (docType === 'pdf') {
      return await parsePDF(buffer);
    } else if (docType === 'docx') {
      return await parseDOCX(buffer);
    } else if (docType === 'doc') {
      return {
        content: '',
        type: 'doc',
        error: 'Legacy .doc format not supported. Please convert to .docx',
      };
    }

    return null;
  } catch (error) {
    console.error('Document fetch error:', error);
    return {
      content: '',
      type: docType,
      error: error instanceof Error ? error.message : 'Failed to fetch document',
    };
  }
}

export async function parseDocumentFromBuffer(
  buffer: Buffer,
  filename: string
): Promise<ParsedDocument | null> {
  const docType = getDocumentType(filename);
  if (!docType) return null;

  if (docType === 'pdf') {
    return await parsePDF(buffer);
  } else if (docType === 'docx') {
    return await parseDOCX(buffer);
  } else if (docType === 'doc') {
    return {
      content: '',
      type: 'doc',
      error: 'Legacy .doc format not supported. Please convert to .docx',
    };
  }

  return null;
}
