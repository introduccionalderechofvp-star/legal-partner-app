# Reparto Hernán / Felipe

Aplicación web estática + backend serverless para llevar:

- ingresos normales que sí afectan el tope,
- ingresos especiales que no afectan el tope,
- gastos compartidos,
- arrastres mensuales,
- reembolsos de gastos pagados después del tope,
- saldos pendientes entre socios,
- edición y eliminación de movimientos,
- exportación a Excel.

## Arquitectura

- **Frontend:** HTML, CSS y JavaScript estático.
- **Backend:** Cloudflare Pages Functions / Workers.
- **Base de datos:** Cloudflare D1 (SQLite serverless).
- **Protección mínima:** PIN compartido vía variable de entorno `APP_PIN`.

## Regla de negocio implementada

### 1. Ingreso normal
- Cuenta para el tope del socio que lo recibe.
- Hasta completar su tope del mes, se queda 100% para ese socio.
- Solo el excedente se reparte 50/50.
- La parte que recibe el otro socio por ese reparto **sí contribuye** al tope del otro.

### 2. Arrastre mensual
- El faltante para completar el tope se arrastra al siguiente mes.
- Si el faltante vuelve a repetirse, se sigue acumulando.

### 3. Ingreso especial
- **No** contribuye al tope de ninguno.
- Se reparte según el porcentaje que se indique para el otro socio.
- Por defecto viene en 50%.

### 4. Gasto compartido
- Si el socio pagador **todavía no** ha completado su tope de ese mes, el gasto reduce su avance al tope.
- Si el socio pagador **ya** había completado su tope, el gasto queda como **reembolso pendiente** y el sistema se lo devuelve antes de repartir futuros ingresos repartibles de ese mismo socio.

### 5. Pago al otro socio
- Cuando un movimiento genera una parte para el otro socio, puedes marcar si esa parte ya fue pagada.
- Si no se marca, queda en la tabla de pendientes.

## Estructura

- `public/index.html`: interfaz.
- `public/styles.css`: estilos.
- `public/app.js`: lógica del frontend y cálculos.
- `functions/api/[[path]].js`: API CRUD + validación de PIN.
- `schema.sql`: esquema de la base de datos.
- `wrangler.toml`: configuración base para Cloudflare.

## Despliegue en Cloudflare

## Opción recomendada: GitHub + Cloudflare Pages

### 1. Sube este proyecto a GitHub
Crea un repositorio nuevo y sube todo el contenido de esta carpeta.

### 2. Crea la base de datos D1
En Cloudflare:

1. Entra a **Workers & Pages**.
2. Abre **D1**.
3. Crea una base llamada, por ejemplo, `reparto-herman-felipe`.
4. Copia el `database_id`.
5. Reemplaza `REEMPLAZAR_POR_DATABASE_ID` en `wrangler.toml`.
6. Ejecuta el contenido de `schema.sql` en la consola SQL de D1.

### 3. Crea el proyecto Pages
1. En Cloudflare entra a **Workers & Pages**.
2. Elige **Create application**.
3. Selecciona **Pages**.
4. Conecta tu repositorio de GitHub.
5. En la configuración del build usa:
   - **Framework preset:** None
   - **Build command:** dejar vacío
   - **Build output directory:** `public`
6. Despliega.

### 4. Conecta la base D1 al proyecto Pages
Dentro del proyecto Pages:

1. Ve a **Settings**.
2. Busca **Bindings**.
3. Agrega un binding D1:
   - **Variable name:** `DB`
   - **Database:** la que creaste arriba.

### 5. Configura el PIN compartido
Dentro del proyecto Pages:

1. Ve a **Settings**.
2. Busca **Variables and Secrets**.
3. Agrega un secret:
   - **Name:** `APP_PIN`
   - **Value:** el PIN que quieran compartir.

Luego vuelve a desplegar o haz un nuevo deploy.

## Desarrollo local (opcional)
Si quieres probar localmente con Wrangler:

```bash
npm install -g wrangler
wrangler pages dev public --d1 DB=reparto-herman-felipe
```

> Si usas desarrollo local, debes ajustar también el `database_id` real en `wrangler.toml`.

## Qué verás en la app

- selector de quién está ingresando la información,
- formulario para nuevo movimiento,
- vista previa del efecto del movimiento antes de guardar,
- tarjetas resumen por mes para cada socio,
- historial editable,
- tabla de pendientes,
- exportación a `.xlsx`.

## Limitaciones deliberadas de esta versión

- Usa **PIN compartido**, no usuarios individuales.
- No hay bitácora avanzada de cambios.
- El porcentaje variable solo está habilitado para ingresos especiales.
- Para montos impares repartidos 50/50 en ingresos normales, el peso sobrante se queda con el socio que registró el ingreso.

## Sugerencias de mejora futura

- autenticación real por usuario,
- bitácora de auditoría,
- adjuntar soporte PDF o imagen a cada movimiento,
- cierre mensual bloqueable,
- exporte de reportes por rango de fechas,
- tablero de caja real vs causado.
