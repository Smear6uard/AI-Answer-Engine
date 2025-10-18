# AI Answer Engine  (In Progress)

A full-stack AI-powered answer engine built with **Next.js, TypeScript, Groq SDK, and Cheerio**.  
The app allows users to paste URLs or ask questions, scrapes content from websites, and provides answers using an LLM with proper context and source citation.  

---

## Features (Current)
- [x] **Chat interface** where users can ask questions or paste links  
- [x] **Regex-based URL detection** to identify and extract links from user input  
- [x] **Web scraping with Cheerio + Axios** to pull page content (title, meta, headings, paragraphs, lists)  
- [x] **Groq SDK integration** for LLM responses with context injection  
- [x] **Prompt engineering** to ensure answers are based on scraped content  

---

## In Progress
- [ ] Add **Puppeteer fallback** for JavaScript-heavy pages that Cheerio can’t scrape  
- [ ] Improve **prompt formatting** for more reliable answers  
- [ ] Add **Redis caching + rate limiting**  
- [ ] UI polish with **Tailwind CSS**  

---

## Tech Stack
- **Frontend**: Next.js 15, TypeScript, React  
- **Backend**: Next.js API Routes  
- **AI/LLM**: Groq SDK (`llama-3.1-8b-instant`)  
- **Scraping**: Cheerio + Axios  
- **Styling**: Tailwind CSS (planned)  

---

## ⚡ Getting Started
1. Clone the repository:
   ```bash
   git clone https://github.com/Smear6uard/ai-answer-engine.git
   cd ai-answer-engine
