import { GoogleGenAI, Type, Schema } from "@google/genai";
import { FUNDS } from "../constants";

// Ideally, this is injected securely. For this prototype, we assume process.env.API_KEY is available.
// In a real frontend-only demo, the user might need to input this, but per instructions we assume env var.
const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

let ai: GoogleGenAI | null = null;

export class MissingApiKeyError extends Error {
  constructor() {
    super('Gemini API key is missing.');
    this.name = 'MissingApiKeyError';
  }
}

export const isMissingApiKeyError = (error: unknown) => {
  return error instanceof Error && error.name === 'MissingApiKeyError';
};

const getClient = () => {
  if (!apiKey) {
    throw new MissingApiKeyError();
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
};

const MODEL_CHAT = 'gemini-2.5-flash';
const MODEL_REASONING = 'gemini-2.5-flash'; 

// System instruction for the Idea Agent
const AGENT_SYSTEM_INSTRUCTION = `
You are an expert Grant Consultant for Turkish SMEs and Startups (TÜBİTAK, KOSGEB).
Your goal is to help the user refine their R&D project idea into a "Project 1-Pager".
Ask clarifying questions about:
1. The technical innovation (What is new?).
2. The method (How will they do it?).
3. The commercial potential (Who will buy it?).
Keep answers concise. Once you have enough info, suggest generating a Project Summary.
`;

export const createChatSession = () => {
  const client = getClient();
  return client.chats.create({
      model: MODEL_CHAT,
      config: {
        systemInstruction: AGENT_SYSTEM_INSTRUCTION,
      },
    });
};

export const analyzeProjectEligibility = async (projectDescription: string): Promise<any> => {
  const fundsContext = JSON.stringify(FUNDS.map(f => ({ 
    id: f.id, 
    code: f.code, 
    desc: f.description,
    inst: f.institution 
  })));

  const prompt = `
    Analyze the following R&D project description against the provided funding programs.
    
    Project Description:
    "${projectDescription}"

    Available Funds:
    ${fundsContext}

    Task:
    1. Score the eligibility for EACH fund (0-100).
    2. Provide a short rationale referencing specific keywords from the description.
    3. Determine status: 'eligible', 'conditional', or 'ineligible'.

    Return JSON strictly conforming to this schema.
  `;

  // Define response schema
  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        fundId: { type: Type.STRING },
        score: { type: Type.INTEGER },
        rationale: { type: Type.STRING },
        eligibilityStatus: { type: Type.STRING, enum: ['eligible', 'conditional', 'ineligible'] }
      },
      required: ['fundId', 'score', 'rationale', 'eligibilityStatus']
    }
  };

  try {
    const client = getClient();
    const response = await client.models.generateContent({
      model: MODEL_REASONING,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2
      }
    });

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Analysis failed:", error);
    throw error;
  }
};

export const generateDraftOnePager = async (chatHistory: string): Promise<string> => {
    const prompt = `
      Based on the conversation below, write a professional "Project 1-Pager" summary suitable for a TÜBİTAK/KOSGEB application.
      Structure it with:
      1. Project Title
      2. Problem & Solution
      3. Innovative Aspect
      4. Methodology
      
      Conversation History:
      ${chatHistory}
    `;

    try {
      const client = getClient();
      const response = await client.models.generateContent({
        model: MODEL_CHAT,
        contents: prompt,
      });
      return response.text || "Could not generate summary.";
    } catch (e) {
      console.error("Summary generation failed:", e);
      throw e;
    }
}
