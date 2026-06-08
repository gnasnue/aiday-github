// Korean particle helpers

// Returns true if the last syllable of a Korean word ends with a final consonant (받침)
export const hasJongseong = (name: string): boolean => {
  if (!name) return false;
  const lastChar = name.trim().slice(-1);
  const code = lastChar.charCodeAt(0);
  // Hangul syllables block: AC00–D7A3
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
};

// "지우" -> "지우를", "지원" -> "지원이를"
// When the name ends with 받침, append "이" before "를" (colloquial Korean nickname pattern)
export const withSubjectSuffix = (name: string): string => {
  return hasJongseong(name) ? `${name}이를` : `${name}를`;
};

// Topic particle: "지우" -> "지우는", "지원" -> "지원이는"
// Names with 받침 use the colloquial "이는" nickname pattern.
export const withTopicParticle = (name: string): string => {
  return hasJongseong(name) ? `${name}이는` : `${name}는`;
};

// Dative particle: "지우" -> "지우에게는", "민정" -> "민정이에게는"
// Names with 받침 add the colloquial "이" before "에게는".
export const withDativeParticle = (name: string): string => {
  return hasJongseong(name) ? `${name}이에게는` : `${name}에게는`;
};
