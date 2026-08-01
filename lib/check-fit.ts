import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import remusProfile from "../data/remus-profile.json";

// ---- Output schema ----
// Same shape as before — this is what the model must return.
export const CheckFitResultSchema = z.object({
  verdict: z.enum(["strong_fit", "partial_fit", "weak_fit"]),
  match_score: z.number().min(0).max(100).describe("Overall fit percentage"),
  matched_skills: z
    .array(z.string())
    .describe("Skills/requirements from the JD that Remus's profile clearly satisfies"),
  gaps: z
    .array(z.string())
    .describe("Requirements from the JD that Remus's profile does not clearly satisfy"),
  relevant_projects: z
    .array(z.string())
    .describe("Names of projects from the profile most relevant to this JD"),
  summary: z
    .string()
    .describe("2-3 sentence plain-English summary of the fit, no persona styling — just facts"),
});

export type CheckFitResult = z.infer<typeof CheckFitResultSchema>;

// ---- Core matching function ----
// Pure function: JD text in, structured verdict out. No persona, no Taglish —
// that styling happens later when the chat model narrates this result.
export async function checkFit(jobDescription: string): Promise<CheckFitResult> {
  if (!jobDescription || jobDescription.trim().length < 40) {
    throw new Error(
      "Job description text is too short or empty to analyze. Ask the user to paste more detail."
    );
  }

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    temperature: 0.2,
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY, // reuse whatever env var your RAG route already uses
  });

  const structuredModel = model.withStructuredOutput(CheckFitResultSchema, {
    name: "check_fit_result",
  });

  const prompt = `You are evaluating a job description against a candidate's structured profile.
Be honest and specific — do not inflate the match score, and do not invent skills the
candidate doesn't have. Base every claim strictly on the profile data provided.

CANDIDATE PROFILE (JSON):
${JSON.stringify(remusProfile, null, 2)}

JOB DESCRIPTION:
${jobDescription}

Evaluate fit based on: required skills/tech stack overlap, relevant experience/projects,
and any explicit requirements (years of experience, location, education) noted in the JD.
Note that the candidate is a fresh graduate (BSCS, June 2026) with internship-level
professional experience, not years of full-time work — reflect this honestly if the JD
requires multiple years of experience, without being falsely negative about strong
technical overlap elsewhere.`;

  const result = await structuredModel.invoke(prompt);
  return result;
}