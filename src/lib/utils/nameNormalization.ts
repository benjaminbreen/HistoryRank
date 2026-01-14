/**
 * Name normalization utilities for reconciling historical figure names
 * across different sources (Pantheon, LLMs, Wikipedia)
 */

/**
 * Normalize a name for matching purposes
 * - Lowercase
 * - Remove parenthetical content
 * - Standardize common variations
 * - Trim whitespace
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove parenthetical disambiguators like "(Buddha)" or "(the Great)"
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    // Standardize titles and prefixes
    .replace(/^st\.\s*/i, 'saint ')
    .replace(/^sir\s+/i, '')
    .replace(/^dr\.\s*/i, '')
    .replace(/^pope\s+/i, 'pope ')
    .replace(/,\s*(jr\.?|sr\.?|i{1,3}|iv|v|vi{1,3})$/i, '')
    // Normalize Arabic/Persian name prefixes
    .replace(/\s+ibn\s+/g, ' ibn ')
    .replace(/\s+al-/g, ' al-')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate a URL-safe slug from a name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove parenthetical content first
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    // Replace spaces and special chars with hyphens
    .replace(/[^a-z0-9]+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Collapse multiple hyphens
    .replace(/-+/g, '-');
}

/**
 * Extract the "simple" name (usually first + last) from complex names
 * Useful for matching short names like "Newton" to "Isaac Newton"
 */
export function extractSimpleName(name: string): string {
  const normalized = normalizeName(name);
  // Remove common suffixes
  const withoutSuffix = normalized
    .replace(/\s+(the great|the younger|the elder|i{1,3}|iv|v|vi{1,3})$/i, '');
  return withoutSuffix;
}

/**
 * Get the last name (family name) from a full name
 * Handles Western and some Eastern naming conventions
 */
export function getLastName(name: string): string {
  const parts = normalizeName(name).split(' ');
  // For single names, return the whole thing
  if (parts.length === 1) return parts[0];
  // Otherwise return the last part
  return parts[parts.length - 1];
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Check if two names are a fuzzy match
 */
export function isFuzzyMatch(name1: string, name2: string, maxDistance = 3): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  // Exact match after normalization
  if (n1 === n2) return true;

  // Check Levenshtein distance
  return levenshteinDistance(n1, n2) <= maxDistance;
}

/**
 * Determine the era based on birth year
 */
export function determineEra(birthYear: number | null): string | null {
  if (birthYear === null) return null;

  if (birthYear < -600) return 'Ancient';
  if (birthYear < 200) return 'Classical';
  if (birthYear < 800) return 'Late Antiquity';
  if (birthYear < 1500) return 'Medieval';
  if (birthYear < 1800) return 'Early Modern';
  if (birthYear < 1914) return 'Industrial';
  if (birthYear < 1945) return 'Modern';
  return 'Contemporary';
}

/**
 * Map occupation to domain
 */
export function occupationToDomain(occupation: string): string {
  const occ = occupation.toUpperCase();

  const domainMap: Record<string, string[]> = {
    'Science': ['PHYSICIST', 'CHEMIST', 'MATHEMATICIAN', 'BIOLOGIST', 'ASTRONOMER', 'INVENTOR', 'ENGINEER', 'COMPUTER SCIENTIST'],
    'Religion': ['RELIGIOUS FIGURE', 'RELIGIOUS LEADER', 'POPE', 'THEOLOGIAN'],
    'Philosophy': ['PHILOSOPHER', 'THINKER'],
    'Politics': ['POLITICIAN', 'STATESMAN', 'PRESIDENT', 'EMPEROR', 'KING', 'QUEEN', 'MONARCH', 'NOBLEMAN', 'DIPLOMAT'],
    'Military': ['MILITARY LEADER', 'GENERAL', 'SOLDIER', 'CONQUEROR'],
    'Arts': ['WRITER', 'POET', 'NOVELIST', 'PLAYWRIGHT', 'ARTIST', 'PAINTER', 'SCULPTOR', 'COMPOSER', 'MUSICIAN', 'ACTOR', 'FILMMAKER'],
    'Exploration': ['EXPLORER', 'NAVIGATOR', 'TRAVELER'],
    'Economics': ['ECONOMIST', 'BUSINESSPERSON'],
    'Medicine': ['PHYSICIAN', 'DOCTOR', 'SURGEON', 'MEDICAL RESEARCHER'],
    'Social Reform': ['ACTIVIST', 'REFORMER', 'REVOLUTIONARY'],
  };

  for (const [domain, occupations] of Object.entries(domainMap)) {
    if (occupations.some(o => occ.includes(o))) {
      return domain;
    }
  }

  return 'Other';
}
