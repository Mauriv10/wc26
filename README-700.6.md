# Build 700.6 · Actualizaciones automáticas

- Aviso dentro de la PWA cuando hay una versión nueva.
- Botón **Actualizar ahora**.
- Comprobación al abrir, al volver a primer plano y cada 5 minutos.
- `version.json`, `service-worker.js` y `supabase-config.js` nunca se sirven desde caché.
- HTML, JavaScript y CSS usan estrategia network-first con respaldo offline.
- Mantiene Supabase, sincronización y orden de selecciones de la Build 700.5.
- No requiere SQL adicional.
