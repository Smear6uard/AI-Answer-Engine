export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { parseDocumentFromBuffer } from "@/app/utils/documentParser";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

export async function POST(req: Request) {
  try {
    console.log('[UPLOAD] Starting file upload request');
    
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (error) {
      console.error('[UPLOAD] Error parsing form data:', error);
      if (error instanceof Error) {
        console.error('[UPLOAD] Form data error stack:', error.stack);
      }
      return NextResponse.json(
        { error: 'Failed to parse form data. Please ensure the request is multipart/form-data.' },
        { status: 400 }
      );
    }

    const file = formData.get('file') as File | null;

    if (!file) {
      console.error('[UPLOAD] No file provided in form data');
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log(`[UPLOAD] File received: ${file.name}, type: ${file.type}, size: ${file.size} bytes`);

    if (!ALLOWED_TYPES.includes(file.type)) {
      console.error(`[UPLOAD] Invalid file type: ${file.type}`);
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Only PDF and DOCX files are supported.` },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      console.error(`[UPLOAD] File too large: ${file.size} bytes (max: ${MAX_FILE_SIZE})`);
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      console.error('[UPLOAD] File is empty');
      return NextResponse.json(
        { error: 'File is empty' },
        { status: 400 }
      );
    }

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await file.arrayBuffer();
      console.log(`[UPLOAD] File converted to ArrayBuffer: ${arrayBuffer.byteLength} bytes`);
    } catch (error) {
      console.error('[UPLOAD] Error reading file as ArrayBuffer:', error);
      if (error instanceof Error) {
        console.error('[UPLOAD] ArrayBuffer error stack:', error.stack);
      }
      return NextResponse.json(
        { error: 'Failed to read file data' },
        { status: 400 }
      );
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(arrayBuffer);
      console.log(`[UPLOAD] Buffer created: ${buffer.length} bytes`);
      
      if (buffer.length === 0) {
        console.error('[UPLOAD] Buffer is empty after conversion');
        return NextResponse.json(
          { error: 'File data is empty after conversion' },
          { status: 400 }
        );
      }
    } catch (error) {
      console.error('[UPLOAD] Error creating Buffer:', error);
      if (error instanceof Error) {
        console.error('[UPLOAD] Buffer creation error stack:', error.stack);
      }
      return NextResponse.json(
        { error: 'Failed to process file data' },
        { status: 400 }
      );
    }

    console.log(`[UPLOAD] Starting document parsing for: ${file.name}`);
    const result = await parseDocumentFromBuffer(buffer, file.name);

    if (!result) {
      console.error('[UPLOAD] parseDocumentFromBuffer returned null');
      return NextResponse.json(
        { error: 'Could not determine document type or parse document' },
        { status: 400 }
      );
    }

    if (result.error) {
      console.error('[UPLOAD] Document parsing error:', result.error);
      console.error('[UPLOAD] Scraper used:', result.scraperUsed || 'unknown');
      return NextResponse.json(
        { 
          error: result.error,
          scraperUsed: result.scraperUsed,
          details: 'Document parsing failed. Check server logs for more details.'
        },
        { status: 400 }
      );
    }

    // Log extracted content details
    console.log(`[UPLOAD] Successfully parsed document: ${result.type}, ${result.content.length} characters, ${result.pageCount || 'N/A'} pages`);
    console.log(`[UPLOAD] Extracted text length: ${result.content.length}`);
    console.log(`[UPLOAD] Extracted text first 200 chars: ${result.content.slice(0, 200)}`);
    console.log(`[UPLOAD] Scraper used: ${result.scraperUsed || 'unknown'}`);
    
    if (result.content.length === 0) {
      console.warn('[UPLOAD] WARNING: Extracted content is empty!');
    }
    return NextResponse.json({
      content: result.content,
      type: result.type,
      pageCount: result.pageCount,
      filename: file.name,
      scraperUsed: result.scraperUsed,
    });
  } catch (error) {
    console.error('[UPLOAD] Unexpected error:', error);
    if (error instanceof Error) {
      console.error('[UPLOAD] Error message:', error.message);
      console.error('[UPLOAD] Error stack:', error.stack);
      return NextResponse.json(
        { 
          error: `Failed to process file upload: ${error.message}`,
          details: 'Check server logs for full error details.'
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to process file upload. Unknown error occurred.' },
      { status: 500 }
    );
  }
}
