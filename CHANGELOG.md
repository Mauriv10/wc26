# Build 704.6

- FWC usa sus códigos reales 00–19 en toda la app.
- Nueva colección Coca-Cola con código CC y cromos 01–12.
- Nueva categoría de intercambio: Colaboración.
- Los escudos 01 y FWC siguen siendo Especiales.
- Selector de selecciones a ancho completo, con FWC y Coca-Cola destacadas.
- Migración automática de proyectos existentes sin borrar inventario.

# Build 704.5.2

- Corrige el selector «Elegir selección» en iPhone cuando aparece el teclado.
- El modal se adapta al viewport visible y mantiene los resultados justo bajo el buscador.
- La lista dispone de scroll propio y el primer resultado queda visible.
- No modifica el buscador principal, la barra inferior ni el asistente.

# Build 704.5.1 · Actualización y buscadores

- Fuerza la activación inmediata del nuevo service worker y renueva la caché de la PWA.
- Sincroniza todas las referencias internas y visibles con la versión 704.5.1.
- El buscador principal muestra sus resultados por encima del contenido, sin quedar recortados por la cabecera.
- Mantiene intactas la barra inferior estable, el asistente y el inventario.

# Build 704.5 · Mercat Workflow

- Buscador principal reparado con nombres, códigos, castellano e inglés.
- Selector de selección ajustado para mostrar resultados encima del teclado.
- Celebración única al completar el objetivo del álbum.
- Nuevo botón Completar intercambio para sumar recibidos y restar entregados automáticamente.
- La actualización automática requiere una lista exacta de cromos recibidos; el modo Cantidades no puede inventar códigos.

# Build 704.4

- Zona superior clara para eliminar la franja oscura en la PWA.
- Cabecera principal más compacta y mejor integrada con el fondo.
- Cambio visual aislado: barra inferior, scroll, compartir y asistente permanecen intactos respecto a la 704.3.7 estable.

# Build 704.3.7

- Sustituye los campos numéricos de Normales y Especiales por controles + y −.
- Evita abrir el teclado y elimina el zoom automático de Safari/iOS.
- Mantiene intactos la barra inferior, el scroll estable y el resto del asistente de la 704.3.6.

# Build 704.3.6

- Corrige el contraste del texto pegado en el asistente cuando iOS está en modo oscuro.
- Convierte Ajustes en secciones plegables para reducir el scroll.
- Solo una sección de Ajustes puede permanecer abierta a la vez.
- Mantiene sin cambios la barra inferior y el sistema de scroll validado en la 704.3.5.

# Build 704.3.5

- Se mantiene sin cambios el marco inferior estable de la 704.3.4.
- El asistente utiliza una sola superficie de scroll: el propio diálogo.
- Se elimina el scroll anidado que Safari iOS bloqueaba al desplegar listas largas.
- Ahora se puede recorrer por completo “Lo que puedes ofrecer” y la propuesta equilibrada hasta los botones finales.

# Build 704.3.4

- La navegación inferior deja de ser flotante o fija sobre el documento: ahora forma parte de un marco estable fuera del área de scroll.
- Solo el contenido central de la app se desplaza.
- Compartir abre WhatsApp directamente y evita el Web Share API que alteraba el viewport en iOS.
- Reparado el diseño roto de «Analizar lista».
- El asistente usa una única zona de scroll y permite revisar y copiar listas completas.

# Build 704.3.3

- El resultado del intercambio y la lista ofrecible se pueden revisar completos antes de copiar.
- El cuerpo del asistente dispone de scroll táctil independiente en iPhone.
- La barra inferior recupera la geometría de la Build 704.1.1 validada.

- Aclara que la primera lista contiene los cromos que la otra persona quiere de ti.
- La segunda lista contiene los cromos que la otra persona te dará.
- Las líneas no reconocidas de la lista recibida ya no bloquean el intercambio; se muestran plegadas como ignoradas.
- Ignora automáticamente encabezados habituales de otras aplicaciones.
- La propuesta equilibrada muestra los cromos exactos, separados entre normales y especiales.
- El asistente ocupa toda la pantalla del iPhone.
- La navegación inferior pasa a ser un marco sólido de ancho completo, sin aspecto flotante.

# Build 704.3.1

- Corrige el asistente apareciendo incrustado en la página de inicio: el diálogo permanece oculto mientras no tenga el atributo `open`.
- Corrige la versión interna desactualizada que hacía que el aviso «Nueva versión disponible» reapareciera incluso después de actualizar.
- Renueva el nombre de caché del service worker para forzar la instalación limpia de los archivos corregidos.

# Build 704.3

- Recuperada la estrategia estable de compartir de la 704.1.1, sin bloquear ni reposicionar el body.
- Asistente separado por pasos: análisis, revisión de errores e intercambio.
- Los no reconocidos aparecen justo donde se generan.
- Eliminadas las listas largas de no disponibles del flujo principal.
- Ajustes de protecciones resumidos con una vista Gestionar.
- Se mantienen parser bilingüe, intercambio equilibrado, estrellas/protegidos y feedback.

# Build 704.2.3

- Bloqueo/restauración del viewport durante compartir en iOS.
- El asistente deja de usar el elemento dialog nativo.
- Copiar lista completa excluye estrellas y protegidos.
- Revisión de protecciones desde Ajustes.
- Feedback visual y háptico en acciones del asistente.

# Build 704.2.2

- El asistente se abre como capa fija no modal para evitar la regresión del viewport de iOS.
- Restaurado el flujo de compartir de la versión estable 704.1.1.
- El intercambio equilibrado prioriza una unidad de cada cromo.
- Si no hay suficientes modelos diferentes, pregunta si se desean añadir cartas iguales.
- Resultado simplificado para mantener una experiencia clara.

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
