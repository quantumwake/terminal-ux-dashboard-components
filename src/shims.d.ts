// Ambient module shims for untyped deps. react-pivottable ships no types, and
// its CSS is a side-effect import the consuming bundler resolves.
declare module 'react-pivottable/PivotTableUI';
declare module 'react-pivottable/pivottable.css';
