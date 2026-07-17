# Build 700.8.1 — Adaptación al repositorio wc26

## URL pública

`https://mauriv10.github.io/wc26/`

## Cambios

- `manifest.webmanifest`: `start_url` y `scope` apuntan a `/wc26/`.
- Nueva caché `wc26-build-700-8-1` para retirar recursos de builds anteriores.
- Build visible y comprobación de actualización subidas a `700.8.1`.
- URL canónica y documentación de Supabase actualizadas.
- No se modifica el inventario, los objetivos ni los proyectos almacenados en Supabase.

## Ajustes externos que debes comprobar

En Supabase, dentro de **Authentication → URL Configuration**, añade esta URL a **Redirect URLs**:

`https://mauriv10.github.io/wc26/`

Puedes mantener temporalmente la URL anterior mientras pruebas.

En GitHub, comprueba **Settings → Pages** y abre la nueva dirección una vez publicado el contenido.

## Instalación existente

Una PWA instalada desde la dirección antigua pertenece a esa ruta. Abre la nueva URL en Safari o Chrome y vuelve a añadir/instalar la app desde `/wc26/`.
