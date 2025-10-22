# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-powered answer engine built with Next.js 15 that scrapes web content and provides intelligent responses using the Groq LLM API. Users can paste URLs or ask questions, and the system will scrape content from websites and generate contextual answers with proper source citation.

## Common Commands

### Development
```bash
npm run dev          # Start development server with Turbopack
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
npm run format:fix   # Format code with Prettier
```

## Environment Setup

Required environment variables (set in `.env`):
- `GROQ_API_KEY` - API key for Groq SDK (llama-3.1-8b-instant model)

## Architecture Overview

### Request Flow
1. User sends message through chat UI (`src/app/page.tsx`)
2. Frontend makes POST request to `/api/chat`
3. Chat API route (`src/app/api/chat/route.ts`) orchestrates:
   - URL detection via regex pattern
   - Web scraping if URL detected
   - Prompt construction with scraped content
   - LLM response generation
4. Response returned to frontend with answer and metadata

### Core Modules

**Chat API (`src/app/api/chat/route.ts`)**
- Main orchestration layer for the entire flow
- Detects URLs in user messages using `urlPattern` regex
- Calls scraper if URL found, handles scraping errors gracefully
- Constructs prompts with different templates based on:
  - Successful scrape (includes scraped content)
  - Failed scrape (mentions error, uses general knowledge)
  - No URL (general chat mode)
- Cleans user queries by removing URL and common phrases
- Uses Node.js runtime (`export const runtime = "nodejs"`)

**Web Scraping (`src/app/utils/scrapers.ts`)**
- **Dual-mode scraping system** with intelligent fallback:
  - **Cheerio** (primary): Fast, lightweight scraping with Axios
  - **Puppeteer** (fallback): Full browser rendering for JavaScript-heavy sites
- **Smart detection logic**:
  - `detectSPA()` function identifies Single Page Applications (React, Vue, Angular, Next.js)
  - Triggers Puppeteer when: SPA detected OR content < 500 chars
  - Compares results and uses whichever scraper returns more content
- **Retry logic**: 3 attempts with exponential backoff for network resilience
- **Content extraction**:
  - Removes unwanted elements (scripts, styles, nav, footer, ads)
  - Multi-strategy extraction: semantic selectors → paragraphs/lists → body text
  - Max content: 50,000 characters
- **Return structure**: title, headings (h1/h2/h3), metaDescription, content, scraperUsed ('cheerio' | 'puppeteer')
- Exported `urlPattern` regex for URL detection

**Groq Client (`src/app/utils/groqClient.ts`)**
- Wrapper around Groq SDK for LLM interactions
- Uses `llama-3.1-8b-instant` model
- **Chat history support**: `getGroqResponse(message: string, history: FrontendMessage[])`
  - Converts frontend message format (ai/user) to Groq format (assistant/user)
  - Filters out initial greeting message
  - Maintains full conversation context
- System prompt configures AI as web content analysis specialist

**Frontend (`src/app/page.tsx`)**
- Client-side React component with chat interface
- **Full conversation history**: Sends entire message history with each request
- Message state management (array of `{role: 'user' | 'ai', content}`)
- Sends POST to `/api/chat` with `{message, history}`
- Dark theme (gray-900/gray-800 color scheme with cyan accents)
- Loading state with animated dots
- Uses `onKeyDown` for Enter key handling (not deprecated)

**Middleware (`src/middleware.ts`)**
- Currently a pass-through placeholder for future rate limiting
- Runs on all paths except static files and images

### Key Design Patterns

**Intelligent Scraping**: Two-tier scraping approach (Cheerio → Puppeteer) optimizes for speed while ensuring reliability on JavaScript-heavy sites.

**Error Resilience**: Scraping errors don't break the flow - the system falls back to general knowledge and informs the user about the scraping failure.

**Progressive Content Extraction**: The scraper tries multiple strategies to extract content, falling back to broader selectors if specific ones fail.

**Conversation Continuity**: Full chat history is maintained and sent to the LLM for context-aware responses across multiple turns.

**Prompt Engineering**: Clean, concise prompts ensure the LLM knows the context (scraped content vs general knowledge) and provides accurate responses.

**Query Cleaning**: The chat API removes URLs and common phrases from user queries to create natural questions for the LLM.

## Implementation Notes

- Path aliases: Use `@/*` to reference `./src/*` files
- TypeScript strict mode enabled
- Retry logic with exponential backoff for network reliability
- Content length limits prevent token overflow (50K chars from scraper)
- Puppeteer configured with headless mode and sandbox flags for production deployment
- SPA detection patterns cover major frameworks: React, Vue, Angular, Next.js, Nuxt
- API returns `scraperUsed` metadata for debugging and transparency

## Future Planned Features
- Redis caching and rate limiting in middleware
- Support for PDF and other document formats
- Export conversation history
- Custom scraping profiles for specific domains
