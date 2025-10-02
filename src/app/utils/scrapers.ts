import axios from 'axios';
import * as cheerio from 'cheerio';
import { error } from 'console';

export const urlPattern = /^https?:\/\/(?:www\.)?(?:[-a-z0-9]{1,63}\.)+[a-z]{2,63}(?::\d{2,5})?(?:[/?#][^\s"']*)?$/i;

function cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

export async function scrapeURL(url: string)
{
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
    
        $('script').remove();
        $('style').remove();
        $('noscript').remove();
        $('iframe').remove();
        const title = $('title').text();
        const metaDescription = $('meta[name="description"]').attr('content') || '';
        const h1 = $('h1')
            .map((_, el) => $(el).text())
            .get()
            .join(' ');
        const h2 = $('h2')
            .map((_, el) => $(el).text())
            .get()
            .join(' ');
        const articleText = $('article')
            .map((_, el) => $(el).text())
            .get()
            .join(' ');
        const contentText = $('.content, #content, [class*="content"]')
        .map((_, el) => $(el).text())
        .get()
        .join(' ');
        const paragraphs = $('p')
            .map((_, el) => $(el).text())
            .get()
            .join(' ');
    
        const listItems = $('li')
            .map((_, el) => $(el).text())
            .get()
            .join(' ');
            let combineContent = [
            title,
        metaDescription
        , h1, h2, articleText, contentText, paragraphs, listItems
        ].join(' ');
    
        combineContent = cleanText(combineContent).slice(0, 40000); // Limit to first 100000 characters
        return{
            url,
            title:cleanText(title),
            headings:{
                h1: cleanText(h1),
                h2: cleanText(h2)
            },
            metaDescription: cleanText(metaDescription),
            content: combineContent,
            error: null,
        };
    } catch (err) {
        console.error('Error scraping URL:', err);
        return {
            url,
            title: '',
            headings: { h1: '', h2: '' },
            metaDescription: '',
            content: '',
            error: 'Failed to scrape the URL.',
        };
    }
}
