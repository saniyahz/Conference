import Replicate from "replicate";

/**
 * LoRA training for consistent Riri character across pages.
 *
 * Why LoRA:
 *   Base SDXL has no concept of "Riri" — it sees "rhinoceros" and
 *   generates a random rhino each time. Style, proportions, horn shape,
 *   eye size all vary between pages. A LoRA fine-tuned on 10-20
 *   reference images of Riri teaches the model a stable identity:
 *
 *     "TOK rhinoceros" → always the same cute Riri
 *
 * Training flow:
 *   1. Prepare 10-20 reference images of Riri (consistent style)
 *   2. Package them as a zip file accessible via URL
 *   3. Call trainRiriLora() → kicks off training on Replicate
 *   4. Poll with getTrainingStatus() until complete
 *   5. Use the resulting version ID in generatePlate/generateInpaintCharacter
 *
 * Inference with LoRA:
 *   When a LoRA version is available, the prompt changes from
 *     "Riri, cute gray rhinoceros..."
 *   to
 *     "TOK, Riri, cute gray rhinoceros..."
 *   where TOK is the trigger token that activates the LoRA identity.
 */

/**
 * SDXL base version used for training.
 * This is the same version used for inference — training creates
 * a fine-tuned derivative of this version.
 */
const SDXL_TRAINING_VERSION =
  "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b" as const;

export interface LoraTrainingConfig {
  /** URL to a zip file containing 10-20 Riri reference images (PNG/JPG) */
  inputImagesUrl: string;

  /**
   * Replicate destination model in "owner/model-name" format.
   * The trained LoRA will be saved as a new version of this model.
   * You must create this model on Replicate first.
   * Example: "your-username/riri-lora"
   */
  destination: string;

  /** Trigger token that activates the LoRA identity. Default: "RIRI" */
  triggerWord?: string;

  /** Caption prefix for training images. Default: "a illustration of RIRI, " */
  captionPrefix?: string;

  /** Number of training steps. Default: 1000 (good for 10-20 images) */
  maxTrainSteps?: number;

  /** Learning rate. Default: 1e-4 */
  learningRate?: number;

  /** LoRA rank (dimensionality). Higher = more capacity. Default: 16 */
  loraRank?: number;

  /** Resolution for training images. Default: 1024 */
  resolution?: number;

  /**
   * Use center cropping instead of random cropping.
   * Better for character training where subject is centered.
   * Default: true
   */
  centerCrop?: boolean;
}

export interface LoraTrainingResult {
  trainingId: string;
  status: string;
  version?: string;
  logsUrl?: string;
}

export interface LoraConfig {
  /** The trained model version hash (from completed training) */
  version: string;

  /** The trigger token used during training. Must prefix prompts. */
  triggerWord: string;

  /**
   * LoRA scale (0.0 - 1.0). Controls influence of the LoRA.
   * 1.0 = full LoRA effect. 0.7 = blended with base model.
   * Default: 0.8
   */
  loraScale?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start a LoRA training job on Replicate.
 *
 * Prerequisites:
 *   1. Create a model on Replicate: replicate.models.create(owner, name, ...)
 *   2. Prepare a zip of 10-20 Riri reference images
 *   3. Host the zip at a public URL (or use Replicate's file upload API)
 *
 * Returns the training ID for polling.
 *
 * Example:
 *   const result = await trainRiriLora(replicate, {
 *     inputImagesUrl: "https://example.com/riri-anchors.zip",
 *     destination: "your-username/riri-lora",
 *     triggerWord: "RIRI",
 *     maxTrainSteps: 1000,
 *   });
 *   // Poll: const status = await getTrainingStatus(replicate, result.trainingId);
 */
export async function trainRiriLora(
  replicate: Replicate,
  config: LoraTrainingConfig
): Promise<LoraTrainingResult> {
  const {
    inputImagesUrl,
    destination,
    triggerWord = "RIRI",
    captionPrefix,
    maxTrainSteps = 1000,
    learningRate = 1e-4,
    loraRank = 16,
    resolution = 1024,
    centerCrop = true,
  } = config;

  const effectiveCaptionPrefix = captionPrefix ?? `a illustration of ${triggerWord}, `;

  console.log(`[LoRA] Starting training job`);
  console.log(`[LoRA]   Destination: ${destination}`);
  console.log(`[LoRA]   Trigger word: ${triggerWord}`);
  console.log(`[LoRA]   Training images: ${inputImagesUrl}`);
  console.log(`[LoRA]   Steps: ${maxTrainSteps}, LR: ${learningRate}, Rank: ${loraRank}`);

  const [owner, modelName] = destination.split("/");
  if (!owner || !modelName) {
    throw new Error(
      `[LoRA] Invalid destination "${destination}". ` +
      `Must be "owner/model-name" format.`
    );
  }

  try {
    const training = await replicate.trainings.create(
      "stability-ai",
      "sdxl",
      SDXL_TRAINING_VERSION,
      {
        destination: `${owner}/${modelName}`,
        input: {
          input_images: inputImagesUrl,
          token_string: triggerWord,
          caption_prefix: effectiveCaptionPrefix,
          max_train_steps: maxTrainSteps,
          learning_rate: learningRate,
          lora_rank: loraRank,
          resolution: `${resolution}`,
          center_crop: centerCrop,
          train_batch_size: 1,
          gradient_accumulation_steps: 1,
          is_lora: true,
        },
      }
    );

    console.log(`[LoRA] Training started: ${training.id}`);
    console.log(`[LoRA] Status: ${training.status}`);

    return {
      trainingId: training.id,
      status: training.status,
      logsUrl: (training as unknown as Record<string, unknown>).logs_url as string | undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`[LoRA] Training creation failed: ${msg}`);
  }
}

/**
 * Poll a training job for its current status.
 *
 * Statuses: "starting", "processing", "succeeded", "failed", "canceled"
 *
 * When status is "succeeded", the result includes the trained model
 * version hash that you can use for inference.
 */
export async function getTrainingStatus(
  replicate: Replicate,
  trainingId: string
): Promise<LoraTrainingResult> {
  try {
    const training = await replicate.trainings.get(trainingId);
    const t = training as unknown as Record<string, unknown>;

    let version: string | undefined;
    if (training.status === "succeeded" && t.output) {
      const output = t.output as Record<string, unknown>;
      version = output.version as string | undefined;
    }

    return {
      trainingId,
      status: training.status,
      version,
      logsUrl: t.logs_url as string | undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`[LoRA] Failed to get training status: ${msg}`);
  }
}

/**
 * Wait for a training job to complete. Polls until succeeded or failed.
 *
 * Returns the final training result with the version hash on success.
 * Throws on failure or timeout.
 *
 * Default timeout: 60 minutes (LoRA training typically takes 15-30 min).
 */
export async function waitForTraining(
  replicate: Replicate,
  trainingId: string,
  timeoutMs: number = 60 * 60 * 1000,
  pollIntervalMs: number = 30_000
): Promise<LoraTrainingResult> {
  const startTime = Date.now();

  console.log(`[LoRA] Waiting for training ${trainingId} to complete...`);

  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(
        `[LoRA] Training ${trainingId} timed out after ${Math.round(timeoutMs / 60000)} minutes`
      );
    }

    const result = await getTrainingStatus(replicate, trainingId);

    if (result.status === "succeeded") {
      console.log(`[LoRA] Training SUCCEEDED. Version: ${result.version}`);
      return result;
    }

    if (result.status === "failed" || result.status === "canceled") {
      throw new Error(
        `[LoRA] Training ${result.status}: ${trainingId}`
      );
    }

    console.log(
      `[LoRA] Training ${trainingId} status: ${result.status} ` +
      `(${Math.round((Date.now() - startTime) / 1000)}s elapsed)`
    );

    await delay(pollIntervalMs);
  }
}

/**
 * Prepend the LoRA trigger word to a prompt.
 *
 * If the prompt already contains the trigger word, no change is made.
 * The trigger word is placed at the very start so SDXL gives it
 * maximum attention weight.
 */
export function prependTriggerWord(prompt: string, triggerWord: string): string {
  if (prompt.includes(triggerWord)) return prompt;
  return `${triggerWord}, ${prompt}`;
}
