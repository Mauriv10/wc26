# Build 702.2

- Splash de arranque mientras se comprueba sesión y nube.
- Bienvenida seguida de acceso exclusivo con Google.
- Usuarios existentes entran directamente a su colección de Supabase.
- Usuarios sin estado en Supabase crean su primera colección mediante onboarding.
- Objetivo inicial seleccionable y valor 5 preseleccionado.
- Pantalla final «Todo listo».
- Perfil de Ajustes actualizado automáticamente con el nombre de Google.
- Nueva caché `wc26-build-702-2`.

# Build 702.1

- Planned onboarding flow (design)
- Google login flow placeholder
- Version bump


# 702.0.0
- Base para siguiente evolución.

# Historial de cambios

## 701.3.2 — Estabilidad y limpieza
- Corregido el aviso repetitivo de nueva versión.
- `version.json` pasa a ser la fuente de verdad para decidir si hay una actualización.
- Los service workers antiguos o en espera ya no muestran el aviso por sí solos.
- Versión y nombre de caché centralizados en `app-config.js`.
- Eliminados los README de versiones anteriores.
- Eliminado el bloque HTML duplicado del aviso de actualización.

## 701.3.1 — Premium UI
- Cabecera y diseño responsive refinados.
- Edición del nombre y objetivo de las colecciones.
- Acciones para duplicar y eliminar colecciones.

## 701.2 — Interfaz limpia
- Simplificación de la pantalla Cromos.
- Biblioteca de colecciones más directa.
