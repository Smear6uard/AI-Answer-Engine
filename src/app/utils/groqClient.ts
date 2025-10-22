import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface FrontendMessage {
    role: 'user' | 'ai';
    content: string;
}

export async function getGroqResponse(message: string, history: FrontendMessage[] = []) {
    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: `You are an AI assistant specialized in analyzing web content and answering questions. When provided with scraped website content, analyze it thoroughly and cite specific information. When answering general questions, provide helpful responses using your knowledge. Always be clear about whether your response is based on provided website content or general knowledge.`
        }
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

    messages.push({role: 'user', content: message});

    const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages
    });

    return response.choices[0].message.content;
}