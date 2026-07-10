// Forma mínima común entre PostgrestError y AuthError (ambos de supabase-js)
// — así un solo helper traduce errores de la base de datos y de Auth.
interface ErrorSupabase {
  code?: string | null;
  message: string;
  details?: string | null;
}

// Traduce errores de Postgres/Supabase a mensajes en español entendibles por
// alguien sin conocimientos técnicos — evita que jerga como "constraint" o
// "23505" le llegue crudo al usuario (sobre todo en una demo).
export function mensajeSupabase(error: ErrorSupabase): string {
  const dupMatch = (error.details ?? "").match(
    /Key \(([^)]+)\)=\(([^)]+)\) already exists/
  );

  switch (error.code) {
    case "23505": // unique_violation
      return dupMatch
        ? `Ya existe un registro con ${dupMatch[1]} "${dupMatch[2]}".`
        : "Ya existe un registro con ese valor.";
    case "23503": // foreign_key_violation
      return "No se puede completar: hay otros datos relacionados con este registro.";
    case "23514": // check_violation
      return "Uno de los valores no cumple con las reglas permitidas.";
    case "22P02": // invalid_text_representation (ej. UUID inválido)
      return "Uno de los datos tiene un formato inválido.";
    case "42501": // insufficient_privilege (bloqueado por RLS)
      return "No tienes permiso para hacer esto.";
    // Códigos de la Auth API (admin.auth.admin.*), no de Postgres.
    case "email_exists":
    case "user_already_exists":
      return "Ya existe un usuario con ese correo.";
    case "weak_password":
      return "La contraseña es demasiado débil.";
    case "user_banned":
      return "Tu cuenta está desactivada. Contacta a tu gestor.";
    default:
      return error.message;
  }
}
