import { NormalizedScene, CharacterCanon } from "./visual-types";

/**
 * Assemble the final image prompt from normalized scene + character canon.
 * This produces a consistent, well-structured prompt for SDXL.
 */
export function assembleImagePrompt(
  scene: NormalizedScene,
  canon: CharacterCanon
): string {
  const supportingElementsStr = scene.supportingElements.length > 0
    ? scene.supportingElements
        .map(e => `${e.count} ${e.type} positioned ${e.position}`)
        .join("\n")
    : "None";

  const environmentStr = scene.environment.elements.join(", ");

  // Camera description
  const cameraDesc = scene.camera === "wide"
    ? "Wide shot showing full scene with all elements visible"
    : "Medium-wide shot showing main character with surrounding elements";

  return `
Children's picture book illustration, soft watercolor style.
This is a story scene illustration, not a character portrait.

MAIN CHARACTER (must look identical across all pages):
${canon.description}

SCENE:
${scene.mainCharacter.action}, positioned ${scene.mainCharacter.position}.
Visibility: ${scene.mainCharacter.visibility}.

SUPPORTING ELEMENTS:
${supportingElementsStr}

ENVIRONMENT:
${scene.environment.setting} with ${environmentStr}.

CAMERA:
${cameraDesc}

STRICT:
${scene.exclusions.join(". ")}.
  `.trim();
}

/**
 * Build the negative prompt based on scene exclusions and environment
 */
export function assembleNegativePrompt(scene: NormalizedScene): string {
  const base = [
    "portrait",
    "close-up",
    "fashion illustration",
    "outfit change",
    "alternate hairstyle",
    "photorealistic",
    "3d render",
    "anime",
    "text",
    "logo",
    "watermark",
    "signature",
  ];

  // Add environment-specific exclusions
  const envExclusions: string[] = [];

  switch (scene.environment.setting) {
    case "outer space":
    case "moon surface":
      envExclusions.push("forest", "trees", "grass", "flowers", "water", "ocean", "animals", "houses", "buildings");
      break;
    case "underwater ocean":
      envExclusions.push("forest", "trees", "grass", "sky", "land", "ground", "houses", "buildings");
      break;
    case "sky":
      envExclusions.push("ground", "underwater", "space", "indoor");
      break;
    case "indoor":
      envExclusions.push("forest", "wilderness", "ocean", "space");
      break;
    case "forest meadow":
      envExclusions.push("space", "underwater", "ocean", "buildings", "indoor");
      break;
  }

  return [...base, ...envExclusions].join(", ");
}
