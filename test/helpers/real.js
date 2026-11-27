import fs from 'node:fs';
export const real = (n) => fs.readFileSync(new URL(`../fixtures/real/${n}`, import.meta.url), 'utf8');
