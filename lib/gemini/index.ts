import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set");
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface EmailClassification {
  importance: "urgent" | "important" | "normal" | "low";
  category: "partnerships" | "funding" | "programme" | "media" | "finance" | "general" | "spam";
  summary: string;
  suggestedActions: string[];
  draftReply: string | null;
}

export async function classifyEmail(
  subject: string,
  from: string,
  body: string
): Promise<EmailClassification> {
  if (!genAI) {
    console.error("Gemini API not initialized - missing API key");
    return {
      importance: "normal",
      category: "general",
      summary: "AI analysis unavailable - API key not configured",
      suggestedActions: ["Review manually"],
      draftReply: null,
    };
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `You are an email triage assistant for Tek4All, a Nigerian NGO focused on digital education and technology access.

Analyze this email and provide classification:

FROM: ${from}
SUBJECT: ${subject}
BODY:
${body.slice(0, 3000)}

Respond in JSON format only (no markdown, no code blocks):
{
  "importance": "urgent|important|normal|low",
  "category": "partnerships|funding|programme|media|finance|general|spam",
  "summary": "1-2 sentence summary",
  "suggestedActions": ["action 1", "action 2"],
  "draftReply": "draft reply if response needed, or null if no reply needed"
}

Classification guidelines:
- URGENT: Requires immediate attention (deadlines within 48hrs, crisis, VIP sender)
- IMPORTANT: Needs attention this week (funding opportunities, partnership requests)
- NORMAL: Standard communications (general inquiries, updates)
- LOW: Can wait or delegate (newsletters, promotions, FYI emails)

Categories:
- partnerships: Collaboration requests, MOU discussions, partner communications
- funding: Grant opportunities, donor communications, financial support
- programme: Programme-related inquiries, beneficiary matters, implementation
- media: Press inquiries, media coverage, PR matters
- finance: Invoices, payments, financial reports
- general: General inquiries, information requests
- spam: Promotional, unsolicited, irrelevant`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    // Clean the response (remove any markdown formatting)
    const cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    
    const parsed = JSON.parse(cleanedText);
    
    return {
      importance: parsed.importance || "normal",
      category: parsed.category || "general",
      summary: parsed.summary || "No summary available",
      suggestedActions: parsed.suggestedActions || [],
      draftReply: parsed.draftReply || null,
    };
  } catch (error) {
    console.error("Error classifying email:", error);
    return {
      importance: "normal",
      category: "general",
      summary: "Could not analyze email",
      suggestedActions: ["Review manually"],
      draftReply: null,
    };
  }
}

export async function generateReply(
  subject: string,
  from: string,
  body: string,
  instructions?: string
): Promise<string> {
  if (!genAI) {
    return "AI draft unavailable - API key not configured";
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `You are writing a professional email reply on behalf of Tek4All, a Nigerian NGO focused on digital education and technology access.

Original email:
FROM: ${from}
SUBJECT: ${subject}
BODY:
${body.slice(0, 2000)}

${instructions ? `Additional instructions: ${instructions}` : ""}

Write a professional, warm, and helpful reply. Be concise but thorough.
Sign off as "The Tek4All Team" unless specific person context is given.
Do not include subject line, just the body of the reply.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  } catch (error) {
    console.error("Error generating reply:", error);
    return "Unable to generate reply. Please write manually.";
  }
}