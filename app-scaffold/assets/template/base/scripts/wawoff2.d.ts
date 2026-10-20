// wawoff2 is Google's woff2 codec compiled to WebAssembly — pure JS, so it compresses the
// same on a Mac and a Linux CI runner, unlike the native `ttf2woff2`. It ships no types, and
// `scripts/build-funnel.tsx` reads only `compress`. A standalone ambient declaration rather
// than an inline one, because a `declare module` in a file that imports the same package is
// read as an augmentation of the untyped package, which TypeScript refuses.
declare module "wawoff2" {
  export function compress(input: Uint8Array): Promise<Uint8Array>;
  export function decompress(input: Uint8Array): Promise<Uint8Array>;
}
