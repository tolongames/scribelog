// src/levels.ts

/**
 * Definicje standardowych poziomów logowania (zgodne z npm).
 * Niższa wartość oznacza wyższy priorytet.
 */
export const standardLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

// Typ dla nazw poziomów logowania
export type LogLevel = keyof typeof standardLevels;

// Typ dla obiektu poziomów (może być używany do niestandardowych poziomów w przyszłości)
export type LogLevels = Record<string, number>;
