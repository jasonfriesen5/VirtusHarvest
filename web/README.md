# Virtus Feed — consola web

Complemento de escritorio de la app Virtus Feed. Mismo proyecto de Supabase,
misma cuenta, mismos registros. React + Vite + Tailwind, pensado para Netlify.

## Correr localmente

```bash
cd "Virtus Feed Folder/web"
cp .env.example .env
npm install
npm run dev
```

Abre en <http://localhost:5181> (5180 es la consola de Harvest, así que las dos
pueden correr a la vez). Ingrese con el mismo correo y contraseña de la app.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con recarga |
| `npm run build` | Verifica tipos y compila a `dist/` |
| `npm run preview` | Sirve la compilación de producción |
| `npm run typecheck` | Solo tipos |

## Páginas

| Página | Para qué sirve |
| --- | --- |
| **Panel** | Costo por cabeza, consumo de materia seca, entregado por día, insumos más usados, precisión de carga |
| **Descargas** | Cada entrega a un corral — kg/cab, kg MS/cab, costo/cab, orden, export CSV; los filtros van plegados detrás del botón **Filtros** |
| **Mezclas** | Cada carga del mixer, con la puntualidad de la entrega contra la ventana del grupo. Al tocar una fila se despliega la transacción completa: los tiempos de carga, mezclado y entrega; a qué hora se confirmó cada producto y cuánto tardó desde el anterior; formulado vs cargado por ingrediente; y el reparto por corral con la hora de cada descarga |
| **Corrales** | Todos los corrales en orden de recorrido: consumo MS, % del peso vivo, costo/cab/día, GDP, conversión, última lectura de comedero |
| **Corral (detalle)** | Lo que le toca por día, consumo diario, ajustes y lecturas, pesadas, rechazo, entregas |
| **Insumos** | Saldo, valor, uso por día, cobertura en días, merma, y el libro completo de movimientos |
| **Hoy** | Mezclas del día, comidas que faltan por grupo con su próxima ventana de entrega, comidas atrasadas, corrales sin alimentar |
| **Operarios** | Puntualidad de entrega (30 días) y disciplina de mezclado — descargas antes de que termine la mezcla |
| **Gestión** | Alta y edición de corrales, grupos (reparto y ventana horaria de cada comida), raciones con armador de fórmula, insumos, ciclos, mixers y operadores |
| **Cuenta** | Datos de la cuenta, **permisos de la app**, cambio de contraseña, conteo de filas |

La barra superior lleva selector de ciclo, ventana de promedio (7/14/30/90
días), unidad kg/t/lb, idioma **ES/EN** y modo claro/oscuro. Los cinco se
recuerdan.

## Idioma

El español es el idioma fuente y el inglés es la traducción, igual que en la app
(`data-en` sobre marcado en español). El código se lee en el idioma en que se
habla en el corral, y una cadena sin traducir queda en español en lugar de
mostrar una clave cruda tipo `pens.title`.

- `t('texto en español', { placeholders })` en cualquier componente, vía
  `useT()`.
- Las traducciones viven en [`src/lib/i18n.en.ts`](src/lib/i18n.en.ts).
- Las frases interpoladas usan `{v1}`, `{v2}` … y viajan **enteras**: partir una
  oración alrededor de un `<b>` deja fragmentos que ningún traductor puede
  rearmar, y el orden de las palabras cambia entre idiomas.
- Fechas, números y moneda siguen al idioma (`es-PY` / `en-US`), y el cambio es
  síncrono: no queda un cuadro con la página en inglés y los miles en guaraníes.
- Las constantes a nivel de módulo (NAV, TITLES, KIND_LABEL) guardan el español
  y se traducen donde se renderizan — un hook no se puede llamar afuera de un
  componente.
- **`npm run check-i18n` lista lo que falta**, y corre dentro de `npm run build`:
  sin eso, una cadena sin traducir se ve exactamente igual que una traducida
  hasta que alguien cambia el idioma.

Los nombres de idioma quedan en su propio idioma («Español», «English»): quien
busca inglés no debería tener que encontrarlo bajo «Inglés».

## Reglas del dominio que la consola respeta

Estas no son detalles de implementación: si se rompe alguna, la consola y la
app muestran números distintos para el mismo día.

- **"Por día" es por día alimentado**, nunca por día de calendario. Un corral
  alimentado dos días de siete no divide entre siete.
- **Consumo y conversión van en base materia seca.** En base tal cual ofrecido,
  una ración de ensilaje al 32% de MS da más o menos el doble de la cifra real.
- **El rechazo sale del consumo** y vuelve al stock. Sin eso, un corral que deja
  10% todos los días parece comer 10% más de lo que come.
- **Las cifras por cabeza son fotos del momento de la descarga**
  (`kg_per_head`, `dm_kg_per_head`), no cálculos posteriores: las cabezas
  cambian y el % de MS de un insumo se edita, así que recalcular reescribiría
  la historia en silencio.
- **La tolerancia es por ingrediente** (`vf_ingredients.tol_pct`): +20% de
  ensilaje no es lo mismo que +20% de un núcleo mineral.
- **El stock es un libro mayor** (`vf_stock_moves`); el saldo del insumo es solo
  su suma corrida. Un saldo negativo se muestra negativo — significa que salió
  comida que ningún ingreso explica.
- **Sin conteo físico no hay merma**: se muestra "sin conteo", nunca 0%.
- **Sin ventana horaria no hay juicio de puntualidad.** Un grupo sin horario
  muestra "sin horario", no "en horario": no se prometió nada, así que no hay
  nada que juzgar, y mezclar esas dos cosas es como una cifra de puntualidad
  empieza a mentir.
- **Temprano y tarde se compensan.** El deslizador de puntualidad marca
  (%tarde − %temprano), así que quien llega mitad temprano y mitad tarde cae
  justo en el centro. Por eso van siempre los tres conteos debajo, y una
  advertencia explícita cuando se compensan.
- **El mezclado se cuenta desde el ÚLTIMO producto.** `mix_started_at` se sella
  cuando se confirma el último ingrediente, que es lo que "tiempo de mezclado"
  significa en un mixer: todo lo anterior sigue siendo carga. La duración usa
  el sello propio de la app (`mix_actual_sec`, tomado al abrir la compuerta)
  antes que la resta de horas, que incluiría cualquier cosa que pasara después.
- **Una mezcla abandonada no es el registro de nadie.** Las feedings que la app
  cierra como `abandoned` (más de 12 h sin terminar) quedan fuera de las
  estadísticas de puntualidad y mezclado, pero siguen contando en el stock: los
  kilos cargados fueron reales.

Toda la aritmética vive en [`src/lib/analytics.ts`](src/lib/analytics.ts),
portada desde `src/js/20-model.js` de la app — incluidas las ventanas de
entrega (`groupWindows`, `classifyDelivery`), la puntualidad por operario y las
estadísticas de mezclado, que la app calcula igual y muestra en su pantalla de
Operarios.

## Escritura

**La consola es el lugar donde se arma y se mantiene la configuración** — es
donde hay teclado y pantalla grande. Escribe directo en Supabase, con el mismo
`user_id` y las mismas columnas que arma `SYNC_ENTITIES.toCloud` en la app
(`src/js/09-sync.js`), y con ids generados igual que `uid()`. Como el pull de la
app es "manda la nube, salvo lo que este dispositivo cambió y todavía no subió",
cualquier cambio hecho acá llega a las tablets en su próxima sincronización,
incluidas las eliminaciones.

Se puede crear, editar y eliminar: corrales, grupos de alimentación (con la
pertenencia de cada corral), raciones y su fórmula, insumos, ciclos, mixers y
operadores.

Los permisos de la tablet viven todos juntos en **Cuenta ▸ Permisos**, no
repartidos por la pantalla que cada uno afecta. El primero es
`vf_settings.allow_app_ration_edits`: sin ese permiso la tablet muestra las
raciones pero no las edita (`guardRationEdit()` en la app), y la fórmula se
administra solo desde la consola — Gestión ▸ Raciones lo dice pero no lo
cambia. La consola escribe esa fila; la app solo la lee.
**Una fila ausente o ilegible significa PERMITIDO**, nunca bloqueado: un pull
fallido que dejara la app bloqueada dejaría a un operario sin salida a mitad de
turno. Además, desde la página de un corral: ajuste manual del factor,
lectura de comedero y pesada; y desde Insumos: ingresos, conteos y ajustes de
stock.

**Lo que la consola NO escribe, a propósito:**

- **Mezclas y descargas.** Las escribe el mixer con la balanza; teclearlas acá
  sería inventar un peso que nadie midió.
- **El saldo de stock.** Es el saldo corrido del libro `vf_stock_moves`. Se
  mueve con ingresos, conteos y ajustes — escribir el número encima borraría
  justamente la diferencia que mide la merma.
- **El factor del corral como campo suelto.** Se mueve con el ajuste o con la
  lectura de comedero, que aplican los topes (±4%/−10% por paso, factor entre
  0.80 y 1.20, un ajuste por corral por día) y dejan la fila en
  `vf_bunk_scores` que explica por qué el corral recibe lo que recibe.
- **El ciclo activo de una tablet.** Es una preferencia local de cada
  dispositivo, no la columna `active`.
- **El vínculo Bluetooth de un mixer.** Es un hecho de la tablet, no del carro.
- **La puntualidad de una entrega.** La sella la app cuando el alimento
  empieza a llegar al comedero (`delivery_started_at`), y de ahí salen
  `delivery_status` y `delivery_minutes_off`. La consola define la ventana y
  lee el resultado.

Las reglas de seguridad del ajuste están en `src/lib/write.ts`, portadas de
`20-model.js`: no son cortesía de interfaz, subir una ración alta en grano
demasiado rápido causa acidosis.

## Despliegue

`netlify.toml` está en esta carpeta y ya apunta `base` y `publish` al
subdirectorio, porque el repo tiene dos sitios (Harvest en `web/`, Feed acá).
Publique `dist/`, nunca `public/` — `public/` solo tiene archivos que Vite copia
adentro de la compilación, sin `index.html`.

Falta, fuera del repo:

- Un sitio de Netlify y un dominio (`view.virtusfeed.com` cuando exista).
- Las dos variables de entorno de Supabase en la configuración del sitio.
- **Realtime**: ninguna tabla está en la publicación. Hasta correr
  `alter publication supabase_realtime add table public.vf_feedings;` la página
  Hoy se refresca cada 30 segundos en lugar de en vivo, y la insignia de la
  barra dice "Consultando".
