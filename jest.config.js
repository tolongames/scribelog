// jest.config.js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest', // Użyj presetu ts-jest
    testEnvironment: 'node', // Środowisko testowe to Node.js
    roots: ['<rootDir>/src', '<rootDir>/test'], // Gdzie szukać plików źródłowych i testów
    testMatch: [ // Jakie pliki są plikami testowymi
      '**/__tests__/**/*.+(ts|tsx|js)',
      '**/?(*.)+(spec|test).+(ts|tsx|js)'
    ],
    transform: { // Jak transformować pliki
      '^.+\\.(ts|tsx)$': ['ts-jest', {
        // Opcje dla ts-jest, np. wskazanie tsconfig
        tsconfig: 'tsconfig.json'
      }]
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'], // Jakie rozszerzenia plików rozpoznawać
  };