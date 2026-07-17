# Build 700.1 — Fase 1: cuentas de usuario

Esta versión añade la pantalla de acceso y mantiene intacto el inventario local existente. Todavía no sube el inventario a la nube: eso corresponde a la Fase 2.

## 1. Crear el proyecto

1. Entra en Supabase y crea un proyecto.
2. En **Project Settings → API**, copia:
   - Project URL
   - Publishable key (o anon public key en proyectos antiguos)
3. Abre `supabase-config.js` y completa ambos valores.
4. No uses ni publiques nunca la clave `service_role`.

## 2. Configurar las URLs

En **Authentication → URL Configuration**:

- Site URL: `https://mauriv10.github.io/wc26/`
- Añade la misma dirección en Redirect URLs.

## 3. Proveedores

- Email/contraseña funciona al habilitar Email en Authentication Providers.
- Google requiere crear credenciales OAuth y habilitar Google en Supabase.
- Apple requiere una cuenta Apple Developer y configurar el proveedor Apple.

Los botones Google y Apple mostrarán un error hasta que sus proveedores estén configurados.

## Seguridad de los datos actuales

- No se han cambiado las claves de `localStorage`.
- No se reinician proyectos ni inventarios al actualizar.
- La pantalla permite entrar temporalmente en modo local mientras Supabase no esté configurado.
- Antes de publicar, conserva el Excel maestro y una copia JSON exportada desde la app.
