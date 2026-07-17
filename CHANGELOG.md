# Build 703.4.2

- Corrige el viewport comprimido que iOS puede conservar después de compartir con WhatsApp u otra aplicación.
- En la PWA instalada de iPhone/iPad guarda el estado actual y realiza una recarga controlada al regresar.
- Conserva colección activa, filtros, selección y posición de desplazamiento.
- Mantiene la corrección de caché y versión verificable de la 703.4.1.

# Build 703.4.1

- Corrige el número de versión estático que seguía mostrando 703.2 en `index.html`.
- Añade versionado de URL a CSS y JavaScript para evitar archivos antiguos del navegador.
- Elimina el anclaje de la barra mediante `VisualViewport`, que podía desplazarla durante el scroll.
- Restaura la barra con `position: fixed` y `bottom`, y limpia el bloqueo antes y después de compartir.
- Mantiene todas las funciones de compartir de la 703.2.

# Build 703.4

- Barra inferior anclada al viewport visible real mediante VisualViewport.
- Recolocación tras compartir, volver de segundo plano, cambiar de pestaña, redimensionar u orientar el dispositivo.
- Eliminación preventiva del bloqueo de scroll del menú de compartir.
- Versión y caché actualizadas a 703.4.

# Build 703.2

- Nuevo menú al pulsar **Compartir** en «Me faltan» o «Repetidos».
- **Compartir** usa el menú nativo e incluye la bandera emoji de cada selección.
- **Copiar texto** genera una lista limpia sin banderas, pensada para Wallapop, Vinted y webs similares.
- **Copiar compacto** genera una línea por selección, también sin banderas.
- Los tres formatos respetan el orden del desplegable y el orden numérico de los cromos.
- Se mantiene la corrección de segundo plano de la Build 703.1.

# Build 703.1

- Corregido el bloqueo en «Cargando tus colecciones…» al volver desde segundo plano en iPhone.
- Corregido el mismo bloqueo al cambiar de pestaña y regresar en navegadores de ordenador.
- Los eventos de renovación de sesión de Supabase ya no reabren el splash completo.
- Añadida recuperación mediante `visibilitychange`, `pageshow` y `focus`.
- Se mantienen las listas compartibles de la Build 703.0.

# Build 703.0

- Nuevo botón **Compartir** dentro de **Me faltan**.
- Nuevo botón **Compartir** dentro de **Repetidos**.
- Las listas respetan exactamente el orden guardado del desplegable de selecciones.
- Los cromos se ordenan numéricamente dentro de cada selección.
- Las cantidades pendientes o repetidas superiores a una unidad se muestran como `xN`.
- Uso del menú nativo del móvil mediante Web Share API.
- Copia automática al portapapeles cuando compartir no está disponible.
- Nueva caché `wc26-build-703-0`.

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
