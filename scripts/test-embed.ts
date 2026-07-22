import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    model: "gemini-embedding-001",
  });

  const result = await embeddings.embedQuery("hello world");
  console.log("Vector length:", result.length);
  console.log("First 5 values:", result.slice(0, 5));
}

main().catch((err) => console.error("Embedding test failed:", err));
