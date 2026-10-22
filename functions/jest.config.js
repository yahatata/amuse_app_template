/**
 * Jest 設定ファイル
 * 
 * P1-01 テスト実行用
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  setupFiles: ['<rootDir>/__tests__/helpers/setupFirebase.ts'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/helpers/mockStoreConfig.ts'],
  testTimeout: 30000, // Firestore Emulator の起動待ち時間を考慮
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        moduleResolution: 'node',
      },
    },
  },
};

