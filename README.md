# AI Answer Engine

An intelligent web scraping and question-answering system built with Next.js and AI. This application combines advanced web scraping techniques with large language models to provide comprehensive answers based on real-time web content.

## Features

### Core Functionality
- **Intelligent Chat Interface** - Conversational UI with full chat history support
- **Smart URL Detection** - Automatically identifies and processes URLs from user messages
- **Adaptive Web Scraping** - Dual-mode scraping system that intelligently chooses between:
  - **Cheerio** (fast, lightweight) for static content
  - **Puppeteer** (JavaScript rendering) for dynamic SPAs
- **AI-Powered Responses** - Context-aware answers using Groq's LLaMA 3.1 model
- **Source Attribution** - Clear citation of information sources in responses

### Technical Highlights
- Automatic SPA detection (React, Vue, Angular, Next.js)
- Retry logic with exponential backoff for reliable scraping
- Conversation history management
- Clean, modern UI with Tailwind CSS

## Tech Stack

**Frontend**
- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS

**Backend**
- Next.js API Routes (Node.js runtime)
- Groq SDK (`llama-3.1-8b-instant` model)

**Web Scraping**
- Cheerio + Axios (static content)
- Puppeteer (dynamic content)

## Getting Started

### Prerequisites
- Node.js 20+
- npm or yarn
- Groq API key ([Get one here](https://console.groq.com))

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Smear6uard/ai-answer-engine.git
   cd ai-answer-engine
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory:
   ```bash
   GROQ_API_KEY=your_groq_api_key_here
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

### Basic Chat
Simply type a question or message in the chat interface to get AI-powered responses.

### Web Scraping Mode
Paste any URL in your message to automatically scrape and analyze the website content:

```
https://example.com What are the main features of this product?
```

The system will:
1. Detect the URL automatically
2. Scrape the website content (choosing Cheerio or Puppeteer based on the site)
3. Provide an AI-generated answer based on the actual content

### Conversation History
The chat maintains full conversation history, allowing for contextual follow-up questions without re-pasting URLs.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # Main API endpoint
│   ├── utils/
│   │   ├── groqClient.ts         # Groq LLM integration
│   │   └── scrapers.ts           # Web scraping logic
│   ├── layout.tsx
│   └── page.tsx                  # Chat UI
├── middleware.ts                 # Request middleware
└── ...
```

## How It Works

1. **URL Detection**: Regex pattern identifies URLs in user messages
2. **Smart Scraping**:
   - Attempts Cheerio scrape first (fast)
   - Detects if content is JavaScript-rendered
   - Falls back to Puppeteer if needed
3. **Context Building**: Scraped content is formatted into a structured prompt
4. **AI Response**: Groq LLM generates answers with full conversation context
5. **Source Attribution**: Responses clearly indicate whether they're based on scraped content or general knowledge

## Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
npm run format:fix   # Format code with Prettier
```

## Future Enhancements

- Redis caching for frequently accessed URLs
- Rate limiting implementation
- Support for multiple document formats (PDF, DOCX)
- Export conversation history
- Custom scraping profiles for specific websites

## License

MIT

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Powered by [Groq](https://groq.com/)
- Web scraping with [Cheerio](https://cheerio.js.org/) and [Puppeteer](https://pptr.dev/)
