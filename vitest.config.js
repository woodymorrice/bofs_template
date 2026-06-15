import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Pure utility functions — no DOM needed.
        environment: 'node',
        include: ['tests/**/*.test.js'],
    },
});
