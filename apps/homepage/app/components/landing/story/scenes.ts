"use client";

// The three story scenes in one module, so the lazy load is one chunk with
// one copy of the kit. Imported separately, the bundler gave each scene its
// own copy of the kit (about 15 KB gzipped each).
export { default as PlanDemo } from "./PlanDemo";
export { default as OwnerDemo } from "./OwnerDemo";
export { default as LateDemo } from "./LateDemo";
