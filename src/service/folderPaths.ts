import { ValidationError } from "../utils/errors";

/**
 * Validation and resolution for folder paths and folder-map templates.
 *
 * Paths are LOGICAL identifiers inside a tenant's folder tree (database rows),
 * never object-storage locations. Every segment is validated so a path or a
 * template variable can neither traverse outside the tree ("..", "/") nor
 * inject control characters. Tenant isolation itself comes from the
 * tenant-scoped repository queries that consume these values.
 */

export const FOLDER_MAX_DEPTH = 16;
export const FOLDER_MAX_SEGMENT = 255;
export const FOLDER_MAX_PATH = 1000;

/** A segment may not contain slashes, control characters, or be a traversal dot. */
export function validateSegment(value: unknown, label = "Folder name"): string {
  const segment = String(value ?? "").trim();
  if (!segment) throw new ValidationError(`${label} is required`);
  if (segment === "." || segment === "..") {
    throw new ValidationError(`${label} cannot be "." or ".."`);
  }
  if (segment.length > FOLDER_MAX_SEGMENT) {
    throw new ValidationError(`${label} is too long (max ${FOLDER_MAX_SEGMENT} characters)`);
  }
  if (/[/\u0000-\u001f\u007f]/.test(segment)) {
    throw new ValidationError(`${label} contains invalid characters`);
  }
  return segment;
}

/** Splits and validates a path like "submissions/org-123/form-456" into segments. */
export function parsePathSegments(path: unknown): string[] {
  const raw = String(path ?? "").trim();
  if (!raw) throw new ValidationError("Folder path is required");
  if (raw.length > FOLDER_MAX_PATH) throw new ValidationError("Folder path is too long");
  const parts = raw
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) throw new ValidationError("Folder path is required");
  if (parts.length > FOLDER_MAX_DEPTH) {
    throw new ValidationError(`Folder path is too deep (max ${FOLDER_MAX_DEPTH} levels)`);
  }
  return parts.map((part) => validateSegment(part, "Folder path segment"));
}

/** Stored form used by the folders table: leading slash, no trailing slash. */
export function storedPath(segments: string[]): string {
  return `/${segments.join("/")}`;
}

export interface TemplateSegment {
  type: "literal" | "placeholder";
  value: string;
}

const PLACEHOLDER_PATTERN = /^\{([A-Za-z0-9_-]{1,64})\}$/;

/**
 * A template segment is either a literal folder name or exactly one
 * {placeholder}. Mixed segments ("org-{orgId}") are rejected on purpose: one
 * variable must always produce exactly one folder level.
 */
export function parseTemplate(template: unknown): TemplateSegment[] {
  const raw = String(template ?? "").trim();
  if (!raw) throw new ValidationError("Path template is required");
  if (raw.length > FOLDER_MAX_PATH) throw new ValidationError("Path template is too long");
  const parts = raw
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) throw new ValidationError("Path template is required");
  if (parts.length > FOLDER_MAX_DEPTH) {
    throw new ValidationError(`Path template is too deep (max ${FOLDER_MAX_DEPTH} levels)`);
  }
  return parts.map((part) => {
    const match = PLACEHOLDER_PATTERN.exec(part);
    if (match) return { type: "placeholder" as const, value: match[1] };
    if (/[{}/]/.test(part)) {
      throw new ValidationError(
        `Template segment "${part}" must be a literal or exactly one placeholder like {name}`
      );
    }
    validateSegment(part, "Path template segment");
    return { type: "literal" as const, value: part };
  });
}

/** Placeholder names used by a template, in order of first appearance. */
export function templatePlaceholders(template: string): string[] {
  const names: string[] = [];
  for (const segment of parseTemplate(template)) {
    if (segment.type === "placeholder" && !names.includes(segment.value)) names.push(segment.value);
  }
  return names;
}

/**
 * Resolves a template with caller-supplied values. Each value must be a single
 * valid folder segment — a value containing "/", ".." or control characters is
 * rejected, so variables can never inject extra hierarchy levels.
 */
export function resolveTemplate(template: string, vars: Record<string, unknown> | undefined): string {
  const segments = parseTemplate(template);
  return segments
    .map((segment) => {
      if (segment.type === "literal") return segment.value;
      const raw = vars ? vars[segment.value] : undefined;
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        throw new ValidationError(`A value for {${segment.value}} is required`);
      }
      return validateSegment(raw, `Value for {${segment.value}}`);
    })
    .join("/");
}
