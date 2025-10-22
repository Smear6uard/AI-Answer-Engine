import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

async function retryRequest(url: string, maxRetries: number = 3): Promise<AxiosResponse> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
        },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 400;
        },
      });
      
      return response;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }

  throw new Error('Failed to fetch URL after retries');
}

export const urlPattern = /https?:\/\/(?:www\.)?(?:[-a-z0-9]{1,63}\.)+[a-z]{2,63}(?::\d{2,5})?(?:[/?#][^\s"']*)?/gi;

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function detectSPA(html: string): boolean {
  const spaIndicators = [
    /<div id="root">/i,
    /<div id="app">/i,
    /<div id="__next">/i,
    /<div id="__nuxt">/i,
    /data-react-/i,
    /ng-app/i,
    /<script[^>]*src=["'][^"']*react[^"']*["']/i,
    /<script[^>]*src=["'][^"']*vue[^"']*["']/i,
    /<script[^>]*src=["'][^"']*angular[^"']*["']/i,
  ];

  return spaIndicators.some(pattern => pattern.test(html));
}

async function scrapePuppeteer(url: string) {
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const scrapedData = await page.evaluate(() => {
      const unwantedSelectors = ['script', 'style', 'noscript', 'iframe', 'nav', 'header', 'footer', 'aside', '.advertisement', '.ads', '.sidebar'];
      unwantedSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });

      const title = document.querySelector('title')?.textContent || '';
      const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

      const h1 = Array.from(document.querySelectorAll('h1')).map(el => el.textContent).join(' ');
      const h2 = Array.from(document.querySelectorAll('h2')).map(el => el.textContent).join(' ');
      const h3 = Array.from(document.querySelectorAll('h3')).map(el => el.textContent).join(' ');

      const articleText = Array.from(document.querySelectorAll('article, main, .article, .post, .entry, .story, .news-article')).map(el => el.textContent).join(' ');
      const contentText = Array.from(document.querySelectorAll('.content, #content, [class*="content"], .post-content, .entry-content, .article-content, .text-content, .body-content')).map(el => el.textContent).join(' ');
      const paragraphs = Array.from(document.querySelectorAll('p')).map(el => el.textContent).join(' ');
      const listItems = Array.from(document.querySelectorAll('li')).map(el => el.textContent).join(' ');

      const bodyText = document.body?.textContent || '';

      return {
        title,
        metaDescription,
        h1,
        h2,
        h3,
        articleText,
        contentText,
        paragraphs,
        listItems,
        bodyText,
      };
    });

    await browser.close();
    browser = null;

    let combineContent = [
      scrapedData.title,
      scrapedData.metaDescription,
      scrapedData.h1,
      scrapedData.h2,
      scrapedData.h3,
      scrapedData.articleText,
      scrapedData.contentText,
      scrapedData.paragraphs,
      scrapedData.listItems,
    ].filter(text => text && text.trim().length > 0).join(' ');

    if (combineContent.length < 500) {
      combineContent = scrapedData.bodyText;
    }

    combineContent = cleanText(combineContent).slice(0, 50000);

    return {
      url,
      title: cleanText(scrapedData.title),
      headings: {
        h1: cleanText(scrapedData.h1),
        h2: cleanText(scrapedData.h2),
        h3: cleanText(scrapedData.h3),
      },
      metaDescription: cleanText(scrapedData.metaDescription),
      content: combineContent,
      scrapeError: null,
      scraperUsed: 'puppeteer' as const,
    };
  } catch (err) {
    console.error('Error with Puppeteer scraping:', url, err);

    // Ensure browser is closed on error
    if (browser) {
      await browser.close();
    }

    return {
      url,
      title: '',
      headings: { h1: '', h2: '', h3: '' },
      metaDescription: '',
      content: '',
      scrapeError: `Puppeteer failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      scraperUsed: 'puppeteer' as const,
    };
  }
}

export async function scrapeURL(url: string) {
  try {
    if (!urlPattern.test(url)) {
      throw new Error('Invalid URL format');
    }

    const response = await retryRequest(url);
    const $ = cheerio.load(response.data);

    $('script, style, noscript, iframe, nav, header, footer, aside, .advertisement, .ads, .sidebar').remove();

    const title = $('title').text();
    const metaDescription = $('meta[name="description"]').attr('content') || '';

    const h1 = $('h1').map((_, el) => $(el).text()).get().join(' ');
    const h2 = $('h2').map((_, el) => $(el).text()).get().join(' ');
    const h3 = $('h3').map((_, el) => $(el).text()).get().join(' ');

    const articleText = $('article, main, .article, .post, .entry, .story, .news-article').map((_, el) => $(el).text()).get().join(' ');
    const contentText = $('.content, #content, [class*="content"], .post-content, .entry-content, .article-content, .text-content, .body-content').map((_, el) => $(el).text()).get().join(' ');
    const paragraphs = $('p').map((_, el) => $(el).text()).get().join(' ');
    const listItems = $('li').map((_, el) => $(el).text()).get().join(' ');
    const divText = $('div').map((_, el) => $(el).text()).get().join(' ');
    const bodyText = $('body').text();

    let combineContent = [
      title,
      metaDescription,
      h1,
      h2,
      h3,
      articleText,
      contentText,
      paragraphs,
      listItems
    ].filter(text => text && text.trim().length > 0).join(' ');

    if (combineContent.length < 500) {
      combineContent = bodyText;
    }

    if (combineContent.length < 200) {
      combineContent = divText;
    }

    combineContent = cleanText(combineContent).slice(0, 50000);

    const isSPA = detectSPA(response.data);
    const hasLowContent = combineContent.length < 500;

    if (isSPA || hasLowContent) {
      const puppeteerResult = await scrapePuppeteer(url);

      if (puppeteerResult.content.length > combineContent.length || combineContent.length < 200) {
        return puppeteerResult;
      }
    }

    return {
      url,
      title: cleanText(title),
      headings: {
        h1: cleanText(h1),
        h2: cleanText(h2),
        h3: cleanText(h3),
      },
      metaDescription: cleanText(metaDescription),
      content: combineContent,
      scrapeError: null,
      scraperUsed: 'cheerio' as const,
    };
  } catch (err) {
    return {
      url,
      title: '',
      headings: { h1: '', h2: '', h3: '' },
      metaDescription: '',
      content: '',
      scrapeError: `Failed to scrape the URL: ${err instanceof Error ? err.message : 'Unknown error'}`,
      scraperUsed: 'cheerio' as const,
    };
  }
}
