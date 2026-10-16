# 🍸 BarPOS – Sistema de Gestión para Bar en la Nube con Supabase

Sistema web moderno, rápido y en tiempo real diseñado para bares y restaurantes. Cuenta con roles diferenciados (**Mesero**, **Cajero** y **Administrador**) y está optimizado para utilizarse desde el celular y en computadoras de barra.

---

## 📱 Vistas según el Rol

### 1. 🧑‍💼 Mesero (Celular / Móvil)
- **Mapa interactivo de mesas:** Estado en tiempo real (Libre, Ocupada, Pidió cuenta).
- **Toma de pedidos ágil:** Catálogo por categorías, buscador rápido y notas especiales por producto (ej. *"sin hielo"*).
- **Seguimiento en vivo:** Avisos cuando la barra o cocina termina un trago (*"Listo para servir"* con vibración).
- **Petición de cuenta:** Envía la cuenta a caja con un solo toque para liberar la mesa.

### 2. 💵 Cajero (Barra / Computadora o Tablet)
- **Apertura de turno:** Registro de fondo inicial de caja.
- **Cobro de cuentas:** Pagos únicos o combinados (**Efectivo, Tarjeta, QR / Transferencia**), cálculo automático de cambio e impresión de comprobante / ticket.
- **Venta directa en barra:** Venta rápida al paso sin asociar a una mesa.
- **Comandas de barra / cocina:** Pantalla de tragos pendientes en preparación con alerta si tardan más de 15 minutos.
- **Cierre de caja con arqueo:** Comparación del efectivo esperado vs. contado y cálculo de sobrante/faltante.

### 3. 👑 Administrador
- **Dashboard analítico:** Ventas del día, ticket promedio, gráficos de ingresos (últimos 7 días), métodos de pago más usados y productos estrella.
- **Reportes detallados:** Filtrado por fechas, ventas por producto con margen de ganancia (ingreso vs. costo), ventas por mesero, historial de cierres de caja y exportación a **Excel / CSV**.
- **Gestión de catálogo:** Crear y editar productos, precios de venta, costos y categorías con emojis.
- **Control de inventario:** Entradas/salidas manuales de stock, alertas de stock bajo o agotado y registro de movimientos.
- **Gestión de personal y roles:** Crear cuentas para meseros y cajeros, asignar roles y activar o desactivar accesos.

---

## 🚀 Guía Paso a Paso para Conectar Supabase

### Paso 1: Crear el proyecto en Supabase (Gratis)
1. Entra a [https://supabase.com](https://supabase.com) y crea tu cuenta gratuita.
2. Haz clic en **"New Project"**.
3. Elige un nombre (ej. `mi-bar`), define una contraseña para la base de datos y selecciona la región más cercana.

### Paso 2: Ejecutar el Script de la Base de Datos
1. En tu panel de Supabase, en el menú lateral izquierdo ve a **SQL Editor**.
2. Haz clic en **"New query"**.
3. Abre el archivo [`supabase/schema.sql`](supabase/schema.sql) de este proyecto, copia todo su contenido y pégalo en el editor de Supabase.
4. Haz clic en el botón verde **"Run"**.
   > *Esto creará todas las tablas, funciones de stock automático, arqueo de caja, seguridad RLS y canales en tiempo real.*

### Paso 3: Configurar Autenticación
1. En Supabase ve a **Authentication** > **Providers** > **Email**.
2. Desactiva la casilla **"Confirm email"** (para que puedas crear meseros y cajeros sin necesidad de validar correos reales).
3. Haz clic en **Save**.

### Paso 4: Crear tu Primer Administrador
1. En Supabase ve a **Authentication** > **Users** > haz clic en **"Add user"** > **"Create user"**.
   - **Email:** `admin@bar.app`
   - **Password:** *(la contraseña que desees, ej. `admin123`)*
   - Marca la casilla **"Auto Confirm User"**.
   - Haz clic en **Create user**.
2. Vuelve a **SQL Editor**, abre una nueva consulta y ejecuta esta línea para darle el rol de Administrador:
   ```sql
   update public.profiles set role = 'admin', active = true, full_name = 'Administrador' where username = 'admin';
   ```

### Paso 5: Conectar las Credenciales
1. En Supabase ve a **Project Settings** (el engranaje abajo a la izquierda) > **API**.
2. Copia:
   - **Project URL**
   - **Project API keys** -> clave `anon` / `public`.
3. Crea un archivo llamado `.env` en la raíz del proyecto (o copia `.env.example`) y coloca tus datos:
   ```env
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui
   ```
   *(También puedes ingresar las credenciales directamente en la pantalla de bienvenida al abrir la app).*

---

## 💻 Ejecución Local y Prueba en el Celular

### 1. Iniciar el servidor local
```bash
npm run dev
```

En la consola verás algo como:
```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.50:5173/
```

### 2. Abrir en el celular del mesero
- Conecta tu celular a la **misma red Wi-Fi** que tu computadora.
- Abre el navegador de tu celular (Chrome o Safari) e ingresa la dirección **Network** (ej. `http://192.168.1.50:5173/`).
- ¡Listo! En Chrome puedes tocar los 3 puntos y elegir **"Agregar a pantalla de inicio"** para usarla como una aplicación nativa instalada.

---

## 🌐 Publicar en Internet con Git (GitHub / Vercel)

Para que los meseros puedan ingresar desde cualquier lugar con datos móviles (4G/5G) sin depender del Wi-Fi:

### Opción A: Desplegar en Vercel (Recomendado y gratuito)
1. Sube tu código a un repositorio de GitHub:
   ```bash
   git init
   git add .
   git commit -m "Sistema BarPOS completo"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
   git push -u origin main
   ```
2. Entra a [https://vercel.com](https://vercel.com), inicia sesión con GitHub e importa el repositorio.
3. En **Environment Variables**, agrega:
   - `VITE_SUPABASE_URL`: tu Project URL
   - `VITE_SUPABASE_ANON_KEY`: tu anon key
4. Haz clic en **Deploy**. Vercel te dará un enlace seguro `https://tu-bar.vercel.app` listo para usar en cualquier celular.

---

## 🛡️ Estructura del Código

- `supabase/schema.sql`: Esquema PostgreSQL con RLS, triggers de inventario y funciones RPC (`pay_order`, `close_cash_session`, `add_stock`).
- `src/context/AuthContext.jsx`: Manejo de sesiones y perfiles con bloqueo por rol y cuentas inactivas.
- `src/hooks/useRealtime.js`: Suscripción WebSockets para actualización automática entre mesero, cocina y caja.
- `src/pages/mesero/`: Vistas móviles de mesas, pedidos y seguimiento de comandas.
- `src/pages/cajero/`: Caja, apertura/cierre, arqueo, cuentas y comandas de barra.
- `src/pages/admin/`: Dashboard, reportes, inventario, catálogo y gestión de usuarios.
