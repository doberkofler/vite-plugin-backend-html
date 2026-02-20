/**
 * Path normalization utilities for URL construction
 */

/**
 * Strips trailing slashes from path
 * @param path - Path to normalize
 * @returns Path without trailing slashes
 * @public
 */
export const stripTrailingSlash = (path: string): string => {
	return path.replace(/\/+$/u, '');
};

/**
 * Strips leading slashes from path
 * @param path - Path to normalize
 * @returns Path without leading slashes
 * @public
 */
export const stripLeadingSlash = (path: string): string => {
	return path.replace(/^\/+/u, '');
};

/**
 * Ensures path has exactly one leading slash
 * @param path - Path to normalize
 * @returns Path with single leading slash
 * @public
 */
export const ensureLeadingSlash = (path: string): string => {
	return '/' + stripLeadingSlash(path);
};

/**
 * Joins URL parts, ensuring no double slashes
 * @param base - Base URL (trailing slash removed)
 * @param path - Path to append (leading slash removed)
 * @returns Joined URL
 * @public
 */
export const joinUrlParts = (base: string, path: string): string => {
	return `${stripTrailingSlash(base)}/${stripLeadingSlash(path)}`;
};

/**
 * Normalizes redirect location relative to base path
 * Handles:
 * - Fully qualified URLs (extracts path)
 * - Absolute paths (strips base path if present)
 * - Relative paths (ensures leading slash)
 *
 * @param location - Redirect location from backend
 * @param basePath - Base path to strip (e.g. '/lj_unittest/')
 * @returns Normalized location with single leading slash
 * @public
 */
export const normalizeRedirectLocation = (location: string, basePath: string): string => {
	let normalized = location;

	// Handle fully qualified URLs - extract path only
	if (location.startsWith('http://') || location.startsWith('https://')) {
		const url = new URL(location);
		normalized = url.pathname + url.search + url.hash;
	}

	// Strip base path if present
	if (normalized.startsWith(basePath)) {
		normalized = normalized.slice(basePath.length);
	}

	// Ensure single leading slash
	return ensureLeadingSlash(normalized);
};
