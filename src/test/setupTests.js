// Matchers de testing-library (toBeInTheDocument, toBeDisabled, ...) y
// limpieza automática del DOM entre tests de componentes.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
