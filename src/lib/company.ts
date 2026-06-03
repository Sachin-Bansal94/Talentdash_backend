/**
 * Normalises a company name to a canonical form used for deduplication.
 * "Google India", "GOOGLE", "google." → "google"
 * This is the ONLY function that should produce normalized_name values.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '') // strip punctuation
    .replace(/\s+/g, ' ')        // collapse whitespace
    .trim();
}

/**
 * Produces a URL-safe slug from a normalised name.
 * "google india" → "google-india"
 */
export function slugify(normalizedName: string): string {
  return normalizedName.replace(/\s+/g, '-');
}

/**
 * Find or create a Company record by the submitted name.
 * Always normalises before lookup so "Google", "GOOGLE", "google." all resolve
 * to the same row.
 */
import { prisma } from './prisma';

export async function findOrCreateCompany(rawName: string): Promise<string> {
  const normalized = normalizeCompanyName(rawName);
  const slug = slugify(normalized);

  // Try to find existing company by normalised name
  const existing = await prisma.company.findFirst({
    where: { normalized_name: normalized },
  });

  if (existing) return existing.id;

  // Create new company — use the raw name as the display name
  const created = await prisma.company.create({
    data: {
      name: rawName.trim(),
      slug,
      normalized_name: normalized,
    },
  });

  return created.id;
}
