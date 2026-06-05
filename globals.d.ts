// Ambient declaration so `tsc --noEmit` accepts CSS side-effect imports.
// Next.js handles the actual CSS at build time via its own loader; this only
// satisfies the standalone type-check (`npm run typecheck`).
declare module "*.css";
