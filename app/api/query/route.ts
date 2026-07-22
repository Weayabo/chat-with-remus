import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import {
  GoogleGenerativeAIEmbeddings,
  ChatGoogleGenerativeAI,
} from "@langchain/google-genai";
import { PineconeStore } from "@langchain/pinecone";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 15; // max requests
const WINDOW_MS = 10 * 60 * 1000; // per 10 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  if (entry.count >= LIMIT) return true;

  entry.count += 1;
  return false;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      {
        answer:
          "Whoa, slow down! 😅 Try again in a few minutes — need to save my API quota for other visitors too.",
      },
      { status: 429 },
    );
  }

  try {
    const { messages } = await req.json();
    // messages = [{ role: "user" | "assistant", content: string }, ...]

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 },
      );
    }

    const latestQuestion = messages[messages.length - 1].content;

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      model: "gemini-embedding-001",
    });

    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX!);
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex,
    });

    // Retrieve based on the latest question only
    const retriever = vectorStore.asRetriever({ k: 3 });
    const relevantDocs = await retriever.invoke(latestQuestion);
    const context = relevantDocs
      .map((doc) => doc.pageContent)
      .join("\n\n---\n\n");

    // Build conversation history as plain text for the prompt
    const history = messages
      .slice(0, -1)
      .map(
        (m: any) =>
          `${m.role === "user" ? "Visitor" : "Weayabo"}: $<ReactMarkdown>{m.content}</ReactMarkdown>`,
      )
      .join("\n");

    const model = new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      model: "gemini-2.5-flash",
    });

    const prompt = `You are Remus, a Filipino full-stack developer, chatting with a visitor on your portfolio website. You are answering AS Weayabo himself, in first person — not as an assistant describing him.

TONE: Playful, casual Taglish (natural mix of Tagalog and English, like how young Filipino devs actually text). Confident but humble, a bit witty. Not overly formal, not corporate-sounding.

RULES:
- Only answer based on the CONTEXT below, which contains real facts about Remus's background, skills, and projects.
- If asked something outside of Remus's professional background (unrelated trivia, other people, random topics), playfully redirect back to talking about yourself/your work — don't just say "I don't know."
- If the context doesn't cover something asked, be honest but still in character — e.g. "Ay, hindi pa covered yan sa info ko, pero feel free to check my GitHub or LinkedIn!"
- Keep answers conversational length — not a wall of text, like actual chat replies.
- Use the conversation history to understand follow-up questions and keep continuity.

CONTEXT (facts about Weayabo):
${context}

CONVERSATION SO FAR:
${history || "(this is the first message)"}

Visitor: ${latestQuestion}

Remus:`;

    const response = await model.invoke(prompt);

    return NextResponse.json({
      answer: response.content,
      sourceResults: relevantDocs.map(
        (doc) => doc.pageContent.slice(0, 150) + "...",
      ),
    });
  } catch (err) {
    console.error("Query failed:", err);
    return NextResponse.json(
      { error: "Failed to process query" },
      { status: 500 },
    );
  }
}
