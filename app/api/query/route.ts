import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { PineconeStore } from "@langchain/pinecone";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    // 1. Set up embeddings (same model used during ingestion)
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      model: "gemini-embedding-001",
    });

    // 2. Connect to Pinecone
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX!);

    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex,
    });

    // 3. Retrieve top-k relevant chunks
    const retriever = vectorStore.asRetriever({ k: 3 });
    const relevantDocs = await retriever.invoke(question);
    const context = relevantDocs.map((doc) => doc.pageContent).join("\n\n---\n\n");

    // 4. Ask Gemini using retrieved context only
    const model = new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      model: "gemini-2.5-flash",
    });

    const prompt = `You are a helpful assistant answering questions based ONLY on the context below. If the answer isn't in the context, say you don't know.

Context:
${context}

Question: ${question}

Answer:`;

    const response = await model.invoke(prompt);

    return NextResponse.json({
      answer: response.content,
      sources: relevantDocs.map((doc) => doc.pageContent.slice(0, 150) + "..."),
    });
  } catch (err) {
    console.error("Query failed:", err);
    return NextResponse.json({ error: "Failed to process query" }, { status: 500 });
  }
}