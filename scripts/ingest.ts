import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { PineconeStore } from "@langchain/pinecone";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const filePath = path.join(process.cwd(), "data", "sample.txt");
  const rawText = fs.readFileSync(filePath, "utf-8");

  // 1. Split into chunks
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 150,
  });

  const docs = await splitter.createDocuments([rawText]);
  console.log(`Split into ${docs.length} chunks`);

  // 2. Set up embeddings model
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    model: "gemini-embedding-001",
  });

  // 3. Connect to Pinecone
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });
  const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX!);

  // 4. Embed + upsert
  await PineconeStore.fromDocuments(docs, embeddings, {
    pineconeIndex,
    maxConcurrency: 5,
  });

  console.log("✅ Ingestion complete. Vectors stored in Pinecone.");
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
