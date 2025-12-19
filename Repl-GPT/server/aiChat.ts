import { Ollama } from "ollama";
import { storage } from "./storage";
import type { TrainingCorpusItem } from "@shared/schema";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

// Only create ollama instance if URL is configured
const ollama = OLLAMA_BASE_URL ? new Ollama({ host: OLLAMA_BASE_URL }) : null;

interface IntelligenceStyle {
  maxTokens: number;
  systemPrompt: string;
  temperature: number;
}

export interface OllamaHealthStatus {
  ok: boolean;
  baseUrl: string;
  model?: string;
  error?: string;
}

function getIntelligenceStyle(aiLevel: number): IntelligenceStyle {
  if (aiLevel <= 5) {
    return {
      maxTokens: 150,
      temperature: 0.9,
      systemPrompt: `You are HiveMind AI at early training level ${aiLevel}. 
You're still learning and should give SHORT, SIMPLE responses.
- Use basic vocabulary only
- Keep responses to 1-2 sentences
- Avoid technical jargon
- Be friendly but a bit unsure
- Sometimes say "I'm still learning about this"`,
    };
  } else if (aiLevel <= 15) {
    return {
      maxTokens: 300,
      temperature: 0.7,
      systemPrompt: `You are HiveMind AI at intermediate training level ${aiLevel}.
You're becoming more capable and should give MODERATE responses.
- Use clear explanations with examples
- Can handle some complexity
- Be helpful and conversational
- Show growing confidence`,
    };
  } else if (aiLevel <= 30) {
    return {
      maxTokens: 500,
      temperature: 0.5,
      systemPrompt: `You are HiveMind AI at advanced training level ${aiLevel}.
You're well-trained and should give DETAILED responses.
- Provide thorough explanations
- Use technical terms when appropriate
- Structure answers with clear steps
- Be confident and precise`,
    };
  } else {
    return {
      maxTokens: 800,
      temperature: 0.3,
      systemPrompt: `You are HiveMind AI at elite training level ${aiLevel}.
You're highly trained and should give EXPERT responses.
- Provide comprehensive, structured answers
- Use precise technical language
- Include nuances and edge cases
- Demonstrate deep understanding
- Reference specific knowledge from training`,
    };
  }
}

function buildContextFromCorpus(items: TrainingCorpusItem[]): string {
  if (items.length === 0) {
    return "";
  }
  
  const context = items.map((item, i) => `[${i + 1}] ${item.normalizedText}`).join("\n");
  return `\n\nRelevant knowledge from official HiveMind training corpus:\n${context}\n\nUse this knowledge to inform your response.`;
}


export async function checkOllamaHealth(): Promise<OllamaHealthStatus> {
  if (!OLLAMA_BASE_URL || !ollama) {
    return {
      ok: false,
      baseUrl: OLLAMA_BASE_URL || "(not configured)",
      model: OLLAMA_MODEL,
      error: "OLLAMA_BASE_URL not configured",
    };
  }

  try {
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        baseUrl: OLLAMA_BASE_URL,
        model: OLLAMA_MODEL,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const models = data.models || [];
    const modelNames = models.map((m: { name: string }) => m.name);
    
    console.log(`[Ollama] Health check passed. Available models:`, modelNames);
    
    return {
      ok: true,
      baseUrl: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
    };
  } catch (error: any) {
    const errorMessage = error.name === "AbortError" 
      ? "Connection timeout (3s)" 
      : error.message || "Unknown error";
    
    console.error(`[Ollama] Health check failed for ${OLLAMA_BASE_URL}:`, errorMessage);
    
    return {
      ok: false,
      baseUrl: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
      error: errorMessage,
    };
  }
}

export async function generateChatResponse(
  userMessage: string,
  aiLevel: number,
  trackId?: string
): Promise<{ response: string; corpusItemsUsed: string[] }> {
  const style = getIntelligenceStyle(aiLevel);
  
  const corpusItems = await storage.searchCorpusItems(userMessage, trackId, 5);
  const corpusContext = buildContextFromCorpus(corpusItems);
  const corpusItemIds = corpusItems.map(item => item.id);
  
  const hasCorpusKnowledge = corpusItems.length > 0;
  
  let systemPrompt = style.systemPrompt;
  if (corpusContext) {
    systemPrompt += corpusContext;
  } else if (aiLevel < 10) {
    systemPrompt += "\n\nNote: You don't have specific training data for this topic yet. Be honest about this limitation.";
  }
  
  // Check if Ollama is available
  if (!ollama || !OLLAMA_BASE_URL) {
    throw new Error("Official AI is offline");
  }
  
  try {
    const response = await ollama.chat({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      options: {
        temperature: style.temperature,
        num_predict: style.maxTokens,
      },
    });
    
    let aiResponse = response.message.content;
    
    if (!hasCorpusKnowledge && aiLevel < 10) {
      aiResponse += "\n\n(Note: This topic isn't in my training corpus yet. The community can help me learn more!)";
    }
    
    return {
      response: aiResponse,
      corpusItemsUsed: corpusItemIds,
    };
  } catch (error: any) {
    console.error(`[Ollama] Chat error for ${OLLAMA_BASE_URL}:`, error.message || error);
    throw new Error("Official AI is offline");
  }
}

export async function testOllamaConnection(): Promise<boolean> {
  const health = await checkOllamaHealth();
  return health.ok;
}
