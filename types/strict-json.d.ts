// Parsed JSON is `unknown`, not `any`. The standard library types `JSON.parse` and `Body.json()` as
// `any`, which neither no-explicit-any nor noImplicitAny can see, so an unchecked read of a request
// body or a stored document typechecks silently. These declarations merge into the global
// interfaces; a merged overload is tried before the library's own, so every call resolves here.
// Each read then says what it expects: a runtime check where the data is untrusted, or a named cast
// where this codebase wrote the data itself.

interface JSON {
  parse(
    text: string,
    reviver?: (this: unknown, key: string, value: unknown) => unknown,
  ): unknown;
}

interface Body {
  json(): Promise<unknown>;
}

// `Array.isArray` narrows to `any[]` in the standard library, which lets the elements of a parsed
// array escape the check the same way. It narrows to `unknown[]` here.
interface ArrayConstructor {
  isArray(arg: unknown): arg is unknown[];
}
