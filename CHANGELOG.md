## Build 704.2.1
- Parser bilingüe para nombres de selecciones en castellano e inglés.
- Guiones interpretados como separadores (4-17 = 4 y 17), no como rangos.
- Soporte para comas, espacios y abreviaturas mezcladas.
- Refuerzo global para impedir scroll suave en iOS antes y después de compartir.

# Build 704.2 — Asistente inteligente de intercambio

- Analizador de listas convertido en pantalla completa.
- Copia de la lista completa de coincidencias.
- Generación de intercambios equilibrados normal por normal y especial por especial.
- FWC y escudos (número 01) tratados como especiales; fotos de equipo como normales.
- Estrellas TOP protegidas por defecto y controles para marcar estrellas o proteger otros cromos.
- Admite pegar la lista recibida o introducir cantidades de normales y especiales.

# Build 704.1.1

- Desactiva definitivamente el desplazamiento suave para evitar el movimiento de la barra inferior al volver de WhatsApp en iOS.
- Oculta el texto pegado después de analizar y prioriza los resultados; añade “Editar lista pegada”.
- Añade un botón “Sí” en las sugerencias para aplicar la corrección y recalcular automáticamente.
- Corrige colores y contraste de la tarjeta y del diálogo del analizador.

# Build 704.1

- Nuevo **Analizador de listas** dentro de Cambiar.
- Admite códigos oficiales de Panini pegados desde WhatsApp, con comas, espacios o una selección por línea.
- Solo considera disponibles las unidades que exceden el objetivo de la colección.
- Separa cromos disponibles, no disponibles y códigos no reconocidos.
- Sugiere correcciones para abreviaturas con errores simples.
- Permite copiar únicamente los cromos que sí puedes entregar.
- El formato de compartir con banderas ahora es compacto: una línea por selección.
- Las listas exportadas por WC26 pueden analizarse directamente en la app.
- Se conserva la eliminación del desplazamiento suave en iOS de la Build 703.2.1.

# Build 703.2.1

- Prueba dirigida para iOS PWA después de usar el menú nativo de compartir.
- Los desplazamientos programáticos de cambio de pestaña y entrada en modo intercambio pasan de suaves a instantáneos.
- No se modifica la barra inferior, el diseño, los filtros ni la sincronización.

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
