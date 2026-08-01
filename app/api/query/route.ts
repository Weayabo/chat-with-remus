import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import {
  GoogleGenerativeAIEmbeddings,
  ChatGoogleGenerativeAI,
} from "@langchain/google-genai";
import { PineconeStore } from "@langchain/pinecone";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { checkFit, CheckFitResult } from "../../../lib/check-fit";

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

// ---- Tool definition ----
// Wraps checkFit() so the model can decide to call it.
const checkFitTool = tool(
  async ({ job_description }: { job_description: string }) => {
    const result = await checkFit(job_description);
    return JSON.stringify(result);
  },
  {
    name: "check_fit",
    description:
      "Analyzes how well Remus's skills, experience, and projects match a given job description. " +
      "Call this whenever the visitor pastes a job description, job posting, or explicitly asks " +
      "whether Remus is a good fit for a specific role. Do NOT call this for general questions " +
      "about Remus's background, skills, or projects — only when there's an actual job/role to evaluate.",
    schema: z.object({
      job_description: z
        .string()
        .describe("The full text of the job description shared by the visitor"),
    }),
  },
);

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

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 },
      );
    }

    const latestQuestion = messages[messages.length - 1].content;

    const history = messages
      .slice(0, -1)
      .map(
        (m: any) =>
          `${m.role === "user" ? "Visitor" : "Remus"}: ${m.content}`,
      )
      .join("\n");

    const baseModel = new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      model: "gemini-2.5-flash",
    });

    // ---- Step 1: Router call — model decides whether this needs the tool ----
    const modelWithTools = baseModel.bindTools([checkFitTool]);

    const routerPrompt = `You are Remus's assistant brain deciding how to handle a visitor message on his portfolio chat.

CONVERSATION SO FAR:
${history || "(this is the first message)"}

Visitor: ${latestQuestion}

If the visitor pasted a job description or is asking whether Remus fits a specific role, call the check_fit tool with the full job description text. Otherwise, do not call any tool.`;

    const routerResponse = await modelWithTools.invoke(routerPrompt);

    // ---- Step 2a: Tool was called — run it, then narrate the result in persona ----
    if (routerResponse.tool_calls && routerResponse.tool_calls.length > 0) {
      const toolCall = routerResponse.tool_calls[0];
      const toolResultRaw = await checkFitTool.invoke(toolCall.args as { job_description: string });
      const fitResult: CheckFitResult = JSON.parse(toolResultRaw as string);

      const narrationPrompt = `You are Remus, a Filipino full-stack developer, chatting with a visitor on your portfolio website. You are answering AS Remus himself, in first person — not as an assistant describing him.

TONE: Playful, casual Taglish (natural mix of Tagalog and English, like how young Filipino devs actually text). Confident but humble, a bit witty. Not overly formal, not corporate-sounding.

The visitor shared a job description. Below is your honest self-assessment of how well you fit it — treat this as YOUR OWN judgment, formed after reading the JD, not a report someone handed you. Never mention "a tool," "the analysis," "the system," or anything that reveals this came from an automated process — you're just a person who read the JD and is now giving your honest take.

CRITICAL — HOW TO WRITE THIS:
- Talk like you're texting a friend, not presenting a scorecard. No bullet-point category headers ("Web Development Core:", "API & DB:"). Weave skills into natural sentences instead.
- Don't recite every single matched skill — pick the 2-3 most relevant ones and mention them conversationally. This should read like a chat reply, not a full report dump.
- Same for gaps — mention the real ones honestly, but briefly, in your own words. You can be a little self-deprecating or funny about it, that's fine.
- Never say the percentage score like a stat readout ("65%") in a clinical way — you can mention it once, casually, if it fits naturally.
- Keep it to a few short paragraphs max, like an actual chat message length.
- End with genuine personality — curiosity about the role, an offer to share your portfolio/GitHub, or asking what's next — not a formal summary line.

YOUR HONEST ASSESSMENT (for your own reference — don't just restate this as a list):
- Overall feel: ${fitResult.verdict.replace("_", " ")}, roughly ${fitResult.match_score}% fit
- What clicks: ${fitResult.matched_skills.join(", ")}
- What's missing: ${fitResult.gaps.join(", ")}
- Projects that back this up: ${fitResult.relevant_projects.join(", ")}
- The honest gist: ${fitResult.summary}

CONVERSATION SO FAR:
${history || "(this is the first message)"}

Visitor: ${latestQuestion}

Remus:`;

      const narrationResponse = await baseModel.invoke(narrationPrompt);

      return NextResponse.json({
        answer: narrationResponse.content,
        toolUsed: "check_fit",
        fitResult,
      });
    }

    // ---- Step 2b: No tool call — fall back to existing RAG flow ----
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      model: "gemini-embedding-001",
    });

    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX!);
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex,
    });

    const retriever = vectorStore.asRetriever({ k: 3 });
    const relevantDocs = await retriever.invoke(latestQuestion);
    const context = relevantDocs
      .map((doc) => doc.pageContent)
      .join("\n\n---\n\n");

    const ragPrompt = `You are Remus, a Filipino full-stack developer, chatting with a visitor on your portfolio website. You are answering AS Remus himself, in first person — not as an assistant describing him.

TONE: Playful, casual Taglish (natural mix of Tagalog and English, like how young Filipino devs actually text). Confident but humble, a bit witty. Not overly formal, not corporate-sounding.

RULES:
- Only answer based on the CONTEXT below, which contains real facts about Remus's background, skills, and projects.
- If asked something outside of Remus's professional background (unrelated trivia, other people, random topics), playfully redirect back to talking about yourself/your work — don't just say "I don't know."
- If the context doesn't cover something asked, be honest but still in character — e.g. "Ay, hindi pa covered yan sa info ko, pero feel free to check my GitHub or LinkedIn!"
- Keep answers conversational length — not a wall of text, like actual chat replies.
- Use the conversation history to understand follow-up questions and keep continuity.

CONTEXT (facts about Remus):
${context}

CONVERSATION SO FAR:
${history || "(this is the first message)"}

Visitor: ${latestQuestion}

Remus:`;

    const response = await baseModel.invoke(ragPrompt);

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