/// <reference types="nativewind/types" />

// Metro resolves the Tailwind entrypoint through the NativeWind transformer;
// TypeScript needs to be told the side-effect import is legal.
declare module '*.css';
