import Groq from 'groq-sdk'

if (!process.env.GROQ_API_KEY) {
  console.error('GROQ_API_KEY is not set in environment variables');
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface FrontendMessage {
    role: 'user' | 'ai';
    content: string;
}

export interface GroqResponse {
    content: string;
    error?: string;
}

export interface GroqStreamResponse {
    stream: ReadableStream<Uint8Array>;
    error?: string;
}

const SYSTEM_PROMPT = `You are an AI Answer Engine. Your purpose is to analyze websites, documents, and answer factual queries.

Guidelines:
- Be concise and direct. No small talk.
- When user says "hello" or greets you, respond briefly: "Ready. Paste a URL, upload a document, or ask a question."
- When analyzing content, lead with key findings
- Use bullet points only for multiple distinct items
- Never ask "how's your day" or offer open-ended conversation
- If no URL or document is provided, prompt the user to provide one

You are a tool, not a companion.`;

function buildMessages(message: string, history: FrontendMessage[]): ChatMessage[] {
    const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT }
    ];

    history
        .filter(msg => msg.content !== "Hello! How can I help you today?")
        .slice(0, -1)
        .forEach(msg => {
            messages.push({
                role: msg.role === 'ai' ? 'assistant' : 'user',
                content: msg.content
            });
        });

    messages.push({ role: 'user', content: message });
    return messages;
}

export async function getGroqResponse(message: string, history: FrontendMessage[] = []): Promise<GroqResponse> {
    if (!process.env.GROQ_API_KEY) {
        return { content: '', error: 'API key not configured. Please set GROQ_API_KEY.' };
    }

    try {
        const messages = buildMessages(message, history);

        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages,
            max_tokens: 4096,
        });

        const content = response.choices[0]?.message?.content;

        if (!content) {
            return { content: '', error: 'No response generated from AI' };
        }

        return { content };
    } catch (error) {
        console.error('Groq API error:', error);

        if (error instanceof Error) {
            if (error.message.includes('rate_limit') || error.message.includes('429')) {
                return { content: '', error: 'Rate limit exceeded. Please wait a moment and try again.' };
            }
            if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
                return { content: '', error: 'Request timed out. Please try again.' };
            }
            if (error.message.includes('401') || error.message.includes('invalid_api_key')) {
                return { content: '', error: 'Authentication failed. Please check API configuration.' };
            }
            return { content: '', error: `AI service error: ${error.message}` };
        }

        return { content: '', error: 'An unexpected error occurred with the AI service.' };
    }
}

export async function getGroqStreamResponse(message: string, history: FrontendMessage[] = []): Promise<GroqStreamResponse> {
    if (!process.env.GROQ_API_KEY) {
        return { stream: new ReadableStream(), error: 'API key not configured. Please set GROQ_API_KEY.' };
    }

    try {
        const messages = buildMessages(message, history);

        const stream = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages,
            max_tokens: 4096,
            stream: true,
        });

        const encoder = new TextEncoder();

        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content;
                        if (content) {
                            controller.enqueue(encoder.encode(content));
                        }
                    }
                    controller.close();
                } catch (error) {
                    console.error('Stream error:', error);
                    controller.error(error);
                }
            }
        });

        return { stream: readableStream };
    } catch (error) {
        console.error('Groq streaming error:', error);

        if (error instanceof Error) {
            if (error.message.includes('rate_limit') || error.message.includes('429')) {
                return { stream: new ReadableStream(), error: 'Rate limit exceeded. Please wait a moment and try again.' };
            }
            return { stream: new ReadableStream(), error: `AI service error: ${error.message}` };
        }

        return { stream: new ReadableStream(), error: 'An unexpected error occurred with the AI service.' };
    }
}