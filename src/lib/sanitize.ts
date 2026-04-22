import DOMPurify from "dompurify";

/**
 * Sanitize untrusted signature/email HTML before rendering with
 * dangerouslySetInnerHTML. Allows the tags/attributes typically used
 * in email signatures (including tables and inline `cid:` images)
 * while stripping scripts, event handlers, and dangerous URIs.
 */
export function sanitizeSignature(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "a", "img", "span", "div",
      "ul", "ol", "li", "h1", "h2", "h3", "h4", "small", "b", "i",
      "table", "thead", "tbody", "tr", "td", "th",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "style", "target", "rel", "class",
      "width", "height",
    ],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|cid):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

/** Backwards-compatible alias matching the more descriptive name. */
export const sanitizeSignatureHtml = sanitizeSignature;
