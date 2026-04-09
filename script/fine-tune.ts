/**
 * HomeDirectAI — Fine-Tuning Pipeline
 *
 * Exports training data and optionally triggers fine-tuning on Together AI.
 *
 * Usage:
 *   npx tsx script/fine-tune.ts export          # Export JSONL training data
 *   npx tsx script/fine-tune.ts upload           # Upload to Together AI
 *   npx tsx script/fine-tune.ts start            # Start fine-tuning job
 *   npx tsx script/fine-tune.ts status <job-id>  # Check job status
 */

import fs from "fs";
import path from "path";

const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;
const TOGETHER_BASE = "https://api.together.xyz/v1";
const OUTPUT_DIR = path.join(process.cwd(), "training-data");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "real-estate-knowledge.jsonl");

async function exportTrainingData() {
  const { generateTrainingData, getTrainingDataCount } = await import("../server/training-data");
  const filePath = await generateTrainingData();
  const count = getTrainingDataCount();
  console.log(`\nExported ${count} training examples to:\n  ${filePath}\n`);
  console.log(`File size: ${(fs.statSync(filePath).size / 1024).toFixed(1)} KB`);
  console.log(`\nNext steps:`);
  console.log(`  1. Review the JSONL file for quality`);
  console.log(`  2. Run: npx tsx script/fine-tune.ts upload`);
  console.log(`  3. Run: npx tsx script/fine-tune.ts start`);
  return filePath;
}

async function uploadToTogether() {
  if (!TOGETHER_API_KEY) {
    console.error("Error: TOGETHER_API_KEY environment variable is required");
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_FILE)) {
    console.log("Training data not found. Generating...");
    await exportTrainingData();
  }

  console.log(`Uploading ${OUTPUT_FILE} to Together AI...`);

  const fileContent = fs.readFileSync(OUTPUT_FILE);
  const formData = new FormData();
  formData.append("file", new Blob([fileContent], { type: "application/jsonl" }), "real-estate-knowledge.jsonl");
  formData.append("purpose", "fine-tune");

  const res = await fetch(`${TOGETHER_BASE}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOGETHER_API_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const error = await res.text();
    console.error(`Upload failed: ${res.status} ${error}`);
    process.exit(1);
  }

  const data = await res.json() as any;
  console.log(`\nFile uploaded successfully!`);
  console.log(`  File ID: ${data.id}`);
  console.log(`  Filename: ${data.filename}`);
  console.log(`  Size: ${(data.bytes / 1024).toFixed(1)} KB`);
  console.log(`\nNext: Run 'npx tsx script/fine-tune.ts start' to begin fine-tuning`);

  // Save file ID for the start command
  const metaPath = path.join(OUTPUT_DIR, "upload-meta.json");
  fs.writeFileSync(metaPath, JSON.stringify({ fileId: data.id, uploadedAt: new Date().toISOString() }, null, 2));
  return data.id;
}

async function startFineTuning() {
  if (!TOGETHER_API_KEY) {
    console.error("Error: TOGETHER_API_KEY environment variable is required");
    process.exit(1);
  }

  const metaPath = path.join(OUTPUT_DIR, "upload-meta.json");
  if (!fs.existsSync(metaPath)) {
    console.error("No upload metadata found. Run 'npx tsx script/fine-tune.ts upload' first.");
    process.exit(1);
  }

  const { fileId } = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  console.log(`Starting fine-tuning job with file ${fileId}...`);

  const res = await fetch(`${TOGETHER_BASE}/fine-tunes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOGETHER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      training_file: fileId,
      model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      n_epochs: 3,
      learning_rate: 1e-5,
      batch_size: 4,
      suffix: "homedirectai-real-estate",
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error(`Fine-tuning start failed: ${res.status} ${error}`);
    process.exit(1);
  }

  const data = await res.json() as any;
  console.log(`\nFine-tuning job started!`);
  console.log(`  Job ID: ${data.id}`);
  console.log(`  Status: ${data.status}`);
  console.log(`  Base model: meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo`);
  console.log(`  Epochs: 3`);
  console.log(`\nCheck status with: npx tsx script/fine-tune.ts status ${data.id}`);
  console.log(`\nOnce complete, set TOGETHER_MODEL to the fine-tuned model ID in Railway.`);

  const jobMetaPath = path.join(OUTPUT_DIR, "fine-tune-job.json");
  fs.writeFileSync(jobMetaPath, JSON.stringify({ jobId: data.id, startedAt: new Date().toISOString(), status: data.status }, null, 2));
  return data.id;
}

async function checkStatus(jobId: string) {
  if (!TOGETHER_API_KEY) {
    console.error("Error: TOGETHER_API_KEY environment variable is required");
    process.exit(1);
  }

  if (!jobId) {
    const jobMetaPath = path.join(OUTPUT_DIR, "fine-tune-job.json");
    if (fs.existsSync(jobMetaPath)) {
      jobId = JSON.parse(fs.readFileSync(jobMetaPath, "utf-8")).jobId;
    } else {
      console.error("No job ID provided and no saved job found.");
      process.exit(1);
    }
  }

  const res = await fetch(`${TOGETHER_BASE}/fine-tunes/${jobId}`, {
    headers: { Authorization: `Bearer ${TOGETHER_API_KEY}` },
  });

  if (!res.ok) {
    const error = await res.text();
    console.error(`Status check failed: ${res.status} ${error}`);
    process.exit(1);
  }

  const data = await res.json() as any;
  console.log(`\nFine-tuning Job Status:`);
  console.log(`  Job ID: ${data.id}`);
  console.log(`  Status: ${data.status}`);
  console.log(`  Model: ${data.model}`);
  if (data.output_name) {
    console.log(`  Fine-tuned Model ID: ${data.output_name}`);
    console.log(`\n  >>> Set this in Railway: TOGETHER_MODEL=${data.output_name}`);
  }
  if (data.training_steps) console.log(`  Training steps: ${data.training_steps}`);
  if (data.events?.length) {
    console.log(`\n  Recent events:`);
    data.events.slice(-5).forEach((e: any) => console.log(`    ${e.created_at}: ${e.message}`));
  }
}

// ── CLI Entry Point ──────────────────────────────────────────────────────────

const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case "export":
    exportTrainingData();
    break;
  case "upload":
    uploadToTogether();
    break;
  case "start":
    startFineTuning();
    break;
  case "status":
    checkStatus(arg);
    break;
  default:
    console.log(`
HomeDirectAI Fine-Tuning Pipeline
──────────────────────────────────

Commands:
  export    Generate JSONL training data file
  upload    Upload training data to Together AI
  start     Start a fine-tuning job on Together AI
  status    Check fine-tuning job status

Example workflow:
  1. npx tsx script/fine-tune.ts export
  2. npx tsx script/fine-tune.ts upload
  3. npx tsx script/fine-tune.ts start
  4. npx tsx script/fine-tune.ts status
  5. Set TOGETHER_MODEL=<fine-tuned-model-id> in Railway

Required: TOGETHER_API_KEY environment variable
`);
}
