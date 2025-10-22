export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getGroqResponse } from "@/app/utils/groqClient";
import { scrapeURL, urlPattern } from "@/app/utils/scrapers";

interface Message {
  role: 'user' | 'ai';
  content: string;
}

export async function POST(req: Request) {
  try {
    const { message, history = [] } = await req.json() as { message: string; history: Message[] };

    const urls = message.match(urlPattern);
    const url = urls ? urls[0] : null;

    let scrapedContent = "";
    let scrapeError = null;
    let scraperUsed = null;

    if (url) {
      const scraperResponse = await scrapeURL(url);

      if (scraperResponse.scrapeError) {
        scrapeError = scraperResponse.scrapeError;
      } else {
        scrapedContent = scraperResponse.content;
        scraperUsed = scraperResponse.scraperUsed;
      }
    }

    let userQuery = url ? message.replace(url, "").trim() : message.trim();

    if (url) {
      userQuery = userQuery
        .replace(/^(give me a summary of this site:|summarize this site:|tell me about this site:|what is this site about:|analyze this website:|review this website:)/i, "")
        .replace(/^(this site|this website|this page|this url)/i, "it")
        .trim();

      if (!userQuery || userQuery.match(/^[.,!?;:\s]*$/)) {
        userQuery = "Please provide a comprehensive summary and analysis of this website";
      }
    }

    let prompt;
    if (scrapedContent) {
      prompt = `User Question: "${userQuery}"

WEBSITE CONTENT:
${scrapedContent}

Instructions:
- Analyze the website content thoroughly and provide a comprehensive answer
- Cite specific information from the content
- Clearly indicate that your response is based on the scraped website data
- If the content doesn't fully answer the question, state this limitation`;
    } else if (scrapeError) {
      prompt = `User Question: "${userQuery}"

Note: Unable to access webpage content (Error: ${scrapeError})

Instructions:
- Provide a helpful answer using general knowledge
- Mention that you couldn't access the specific webpage
- Offer alternative suggestions if appropriate`;
    } else {
      prompt = `User Message: "${userQuery}"

Instructions:
- Provide a helpful, conversational response
- Use your general knowledge to answer the question`;
    }

    const response = await getGroqResponse(prompt, history);

    return NextResponse.json({
      message: response,
      scrapedContent: scrapedContent ? scrapedContent.substring(0, 200) + "..." : null,
      scrapeError: scrapeError,
      scraperUsed: scraperUsed
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { message: "An error occurred processing your request" },
      { status: 500 }
    );
  }
}
