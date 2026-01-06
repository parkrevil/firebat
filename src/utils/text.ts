export function isKebabCase(text: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(text);
}

export function isPascalCase(text: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(text);
}

export function isCamelCase(text: string): boolean {
  return /^[a-z][a-zA-Z0-9]*$/.test(text);
}
