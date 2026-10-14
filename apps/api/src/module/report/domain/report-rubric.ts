export const criterionRubric = {
  VOCABULARY: 'Range, precision and appropriateness of vocabulary in the supplied answers.',
  GRAMMAR: 'Accuracy and variety of grammatical structures in the supplied transcripts.',
  PRONUNCIATION: 'Intelligibility, clarity, stress and intonation observed in the audio. Do not penalize an accent merely for differing from a native accent.',
  FLUENCY: 'Continuity, meaningful pauses, repetitions and self-repairs observed in the full audio. Never infer these from transcript punctuation.',
  RELEVANCE: 'How directly and coherently the answer addresses its question. Do not grade specialist knowledge.',
};
export const levelRubric = {
  BEGINNER_LOW: 'Mostly individual words and memorized short expressions.',
  BEGINNER_MID: 'Simple sentences answering basic questions.',
  BEGINNER_HIGH: 'Connected short sentences on familiar topics.',
  INTERMEDIATE_LOW: 'Explains experiences and plans with simple reasons.',
  INTERMEDIATE_MID: 'Coherent multi-sentence comparisons, reasons and opinions.',
  INTERMEDIATE_HIGH: 'Provides specific explanations and supporting reasons across topics.',
  ADVANCED_LOW: 'Logical opinions and alternatives on abstract topics.',
  ADVANCED_MID: 'Precise, flexible communication about complex topics.',
  ADVANCED_HIGH: 'Natural, nuanced, sophisticated explanations with varied expression.',
};
export const scoreRubric = 'Integer scores 0..100: 0..19 extremely limited demonstrated ability; 20..39 limited short responses with frequent difficulty; 40..59 basic meaning communicated but limited control; 60..79 generally clear, varied, coherent communication; 80..100 precise, flexible, sustained command. Low ability is a valid low score; insufficient evidence is null, never zero. Scores do not mechanically determine level.';
