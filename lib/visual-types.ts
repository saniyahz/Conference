// Shared types for visual generation pipeline

export type CharacterCanon = {
  id: string;
  name: string;
  description: string; // immutable, reused verbatim across all pages
};

export type NormalizedScene = {
  sceneType: string;
  camera: "wide" | "medium-wide" | "medium";
  mainCharacter: {
    id: string;
    position: string;
    visibility: string;
    action: string;
  };
  supportingElements: {
    type: string;
    count: number;
    position: string;
  }[];
  environment: {
    setting: string;
    elements: string[];
  };
  exclusions: string[];
};

export type StoryVisualContext = {
  storyId: string;
  canon: CharacterCanon;
  seed: number;
};
