// @vitest-environment jsdom
//
// Prueba el generador de contraseña segura + el toggle mostrar/ocultar del
// formulario "Nuevo usuario" (ver lib/actions/usuarios.ts) — la contraseña
// temporal en texto plano fue un hallazgo real de la auditoría de jul 2026.
// Se mockean next/navigation y las server actions: este test no envía el
// formulario, solo prueba la interacción del campo de contraseña.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UsuariosView } from "./usuarios-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/actions/usuarios", () => ({
  crearUsuario: vi.fn(),
  cambiarRolUsuario: vi.fn(),
  cambiarEstadoUsuario: vi.fn(),
}));

// Evita cargar el módulo real: lib/actions/autorizacion.ts importa
// lib/push.ts ("server-only"), que truena si un test lo importa fuera de
// un Server Component.
vi.mock("@/lib/actions/autorizacion", () => ({
  guardarUmbralAutorizacion: vi.fn(),
}));

async function abrirFormularioNuevoUsuario() {
  const user = userEvent.setup();
  render(
    <UsuariosView
      usuarios={[]}
      errorInicial={null}
      miId="yo"
      esAdmin={false}
      umbralInicial={50000}
    />
  );
  await user.click(screen.getByRole("button", { name: /nuevo usuario/i }));
  return user;
}

describe("<UsuariosView /> — formulario Nuevo usuario", () => {
  it("el campo de contraseña está enmascarado por defecto (type=password)", async () => {
    await abrirFormularioNuevoUsuario();
    const input = screen.getByLabelText(/contraseña temporal/i);
    expect(input).toHaveAttribute("type", "password");
  });

  it("el botón de mostrar/ocultar alterna el tipo del campo sin perder el valor", async () => {
    const user = await abrirFormularioNuevoUsuario();
    const input = screen.getByLabelText(/contraseña temporal/i) as HTMLInputElement;

    await user.type(input, "abc123");
    expect(input.value).toBe("abc123");

    await user.click(screen.getByRole("button", { name: /mostrar contraseña/i }));
    expect(input).toHaveAttribute("type", "text");
    expect(input.value).toBe("abc123");

    await user.click(screen.getByRole("button", { name: /ocultar contraseña/i }));
    expect(input).toHaveAttribute("type", "password");
    expect(input.value).toBe("abc123");
  });

  it("el botón de generar produce una contraseña fuerte y la revela automáticamente", async () => {
    const user = await abrirFormularioNuevoUsuario();
    const input = screen.getByLabelText(/contraseña temporal/i) as HTMLInputElement;

    await user.click(screen.getByRole("button", { name: /generar contraseña segura/i }));

    expect(input).toHaveAttribute("type", "text"); // se revela para copiarla
    expect(input.value).toHaveLength(12);
    // Sin caracteres ambiguos (I, l, O, 0, 1) — ver ALFABETO_PASSWORD.
    expect(input.value).not.toMatch(/[Il0O1]/);
  });
});
