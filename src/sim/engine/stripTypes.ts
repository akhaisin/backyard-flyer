export function stripTypes(src: string): string {
  return src
    // Remove import lines
    .replace(/^import .+$/gm, '')
    // Remove multiline object type aliases: type X = { ... };
    .replace(/^(?:export )?type \w+ = \{[\s\S]*?\};/gm, '')
    // Remove single-line type aliases
    .replace(/^(?:export )?type \w+ = .+;/gm, '')
    // Remove export keyword
    .replace(/\bexport /g, '')
    // Remove return type annotation before opening brace: ): TypeName {
    .replace(/\)\s*:\s*\w+\s*\{/g, ') {')
    // Remove parameter type annotations: PascalCase types (must have a lowercase after first char) or primitives.
    // Excludes ALL_CAPS identifiers like GRAVITY or MAX_ACC which are constants, not types.
    // (?:\[\])* handles array variants like Vec3[] or string[].
    .replace(/: (?:[A-Z][a-z]\w*|string|number|boolean|void|any|never|unknown)(?:\[\])*(?=[,)\s=])/g, '')
    // Remove line comments
    .replace(/^ *\/\/.*/gm, '');
}
