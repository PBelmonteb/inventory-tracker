// Extiende expect() con los matchers de jest-dom (toBeInTheDocument, etc.)
// para los tests de componentes. Solo importa matchers — no toca el DOM por
// sí mismo, así que es inofensivo para los tests unitarios en entorno "node".
import "@testing-library/jest-dom/vitest";

// A diferencia de Jest, Vitest no limpia el DOM entre tests automáticamente
// — sin esto, el render() de un test se acumula sobre el del anterior en el
// mismo archivo y "getByText" empieza a encontrar elementos duplicados.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
