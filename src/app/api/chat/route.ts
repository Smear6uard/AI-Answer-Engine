export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getGroqResponse, getGroqStreamResponse, FrontendMessage } from "@/app/utils/groqClient";
import { scrapeURL, urlPattern } from "@/app/utils/scrapers";

const MAX_MESSAGE_LENGTH = 100000;
const MAX_HISTORY_LENGTH = 50;

interface RequestBody {
  message: unknown;
  history: unknown;
  stream?: boolean;
}

interface ScrapedSource {
  url: string;
  content: string;
  scraperUsed: string | null;
  error: string | null;
}

function validateMessage(message: unknown): { valid: true; value: string } | { valid: false; error: string } {
  if (typeof message !== 'string') {
    return { valid: false, error: 'Message must be a string' };
  }
  if (!message.trim()) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` };
  }
  return { valid: true, value: message.trim() };
}

function validateHistory(history: unknown): { valid: true; value: FrontendMessage[] } | { valid: false; error: string } {
  if (!Array.isArray(history)) {
    return { valid: false, error: 'History must be an array' };
  }
  if (history.length > MAX_HISTORY_LENGTH) {
    return { valid: false, error: `History exceeds maximum length of ${MAX_HISTORY_LENGTH} messages` };
  }
  for (const msg of history) {
    if (!msg || typeof msg !== 'object') {
      return { valid: false, error: 'Invalid message in history' };
    }
    if (msg.role !== 'user' && msg.role !== 'ai') {
      return { valid: false, error: 'Invalid role in history message' };
    }
    if (typeof msg.content !== 'string') {
      return { valid: false, error: 'Invalid content in history message' };
    }
  }
  return { valid: true, value: history as FrontendMessage[] };
}

async function scrapeMultipleUrls(urls: string[]): Promise<ScrapedSource[]> {
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const result = await scrapeURL(url);
      return {
        url,
        content: result.content,
        scraperUsed: result.scraperUsed,
        error: result.scrapeError,
      };
    })
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      url: urls[index],
      content: '',
      scraperUsed: null,
      error: 'Failed to scrape URL',
    };
  });
}

function buildPrompt(userQuery: string, sources: ScrapedSource[]): string {
  const successfulSources = sources.filter(s => s.content && !s.error);
  const failedSources = sources.filter(s => s.error);

  if (successfulSources.length === 0 && failedSources.length > 0) {
    return `User Question: "${userQuery}"

Note: Unable to access webpage content from ${failedSources.length} URL(s).
Failed URLs: ${failedSources.map(s => s.url).join(', ')}

Instructions:
- Provide a helpful answer using general knowledge
- Mention that you couldn't access the specific webpage(s)
- Offer alternative suggestions if appropriate`;
  }

  if (successfulSources.length === 0) {
    return `User Message: "${userQuery}"

Instructions:
- Provide a helpful, conversational response
- Use your general knowledge to answer the question`;
  }

  const contentSections = successfulSources.map((source, i) =>
    `--- Source ${i + 1}: ${source.url} ---\n${source.content}`
  ).join('\n\n');

  const isComparison = successfulSources.length > 1;

  return `User Question: "${userQuery}"

${isComparison ? 'MULTIPLE WEBSITE CONTENTS:' : 'WEBSITE CONTENT:'}
${contentSections}

Instructions:
- Analyze the website content${isComparison ? 's' : ''} thoroughly and provide a comprehensive answer
${isComparison ? '- Compare and contrast information from different sources\n- Clearly attribute information to specific sources' : '- Cite specific information from the content'}
- Clearly indicate that your response is based on the scraped website data
- If the content doesn't fully answer the question, state this limitation
${failedSources.length > 0 ? `\nNote: Could not access: ${failedSources.map(s => s.url).join(', ')}` : ''}`;
}

export async function POST(req: Request) {
  try {
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const messageValidation = validateMessage(body.message);
    if (!messageValidation.valid) {
      return NextResponse.json(
        { error: messageValidation.error },
        { status: 400 }
      );
    }

    const historyValidation = validateHistory(body.history ?? []);
    if (!historyValidation.valid) {
      return NextResponse.json(
        { error: historyValidation.error },
        { status: 400 }
      );
    }

    const message = messageValidation.value;
    const history = historyValidation.value;
    const shouldStream = body.stream === true;

    const urls = message.match(urlPattern) || [];
    const uniqueUrls = [...new Set(urls)].slice(0, 5);

    let sources: ScrapedSource[] = [];
    if (uniqueUrls.length > 0) {
      sources = await scrapeMultipleUrls(uniqueUrls);
    }

    let userQuery = message;
    for (const url of uniqueUrls) {
      userQuery = userQuery.replace(url, '').trim();
    }

    userQuery = userQuery
      .replace(/^(give me a summary of this site:|summarize this site:|tell me about this site:|what is this site about:|analyze this website:|review this website:|compare these|compare this)/i, "")
      .replace(/^(this site|this website|this page|this url|these sites|these websites)/i, "it")
      .trim();

    if (uniqueUrls.length > 0 && (!userQuery || userQuery.match(/^[.,!?;:\s]*$/))) {
      userQuery = uniqueUrls.length > 1
        ? "Please compare and analyze these websites"
        : "Please provide a comprehensive summary and analysis of this website";
    }

    const prompt = buildPrompt(userQuery, sources);
    if (shouldStream) {
      const streamResult = await getGroqStreamResponse(prompt, history);

      if (streamResult.error) {
        return NextResponse.json(
          { error: streamResult.error },
          { status: 500 }
        );
      }

      return new Response(streamResult.stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'X-Sources': JSON.stringify(sources.map(s => ({ url: s.url, scraperUsed: s.scraperUsed, error: s.error }))),
        },
      });
    }

    const response = await getGroqResponse(prompt, history);

    if (response.error) {
      return NextResponse.json(
        { error: response.error },
        { status: 500 }
      );
    }

    const successfulSources = sources.filter(s => s.content && !s.error);

    return NextResponse.json({
      message: response.content,
      sources: sources.map(s => ({
        url: s.url,
        preview: s.content ? s.content.substring(0, 200) + "..." : null,
        scraperUsed: s.scraperUsed,
        error: s.error,
      })),
      scrapedContent: successfulSources.length > 0 ? successfulSources[0].content.substring(0, 200) + "..." : null,
      scrapeError: sources.find(s => s.error)?.error || null,
      scraperUsed: successfulSources[0]?.scraperUsed || null,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
