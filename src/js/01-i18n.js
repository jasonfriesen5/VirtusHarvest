// Virtus Feed ships to Paraguay. Spanish is the product's default language,
// not a fallback the device happens to select — an English tablet in a
// Paraguayan feedlot should still come up in Spanish. English is opt-in.
function _deviceLangCode() {
  var d = (navigator.language || navigator.userLanguage || 'es').toLowerCase();
  return d.startsWith('en') ? 'en' : 'es';
}
// Two separate things, deliberately: _langPref is what the user picked
// ('auto' | 'en' | 'es') and drives which Settings button is lit; _lang is what
// that currently resolves to and drives T(). Auto has to stay distinguishable
// from a manual pick that happens to match the device, or there'd be no way to
// tell "follow the phone" from "always English".
// Default is 'es', not 'auto': the product is Spanish-first, and a tablet
// bought with an English locale should still open in Spanish. 'auto' and 'en'
// remain available, but only if the user actually picks one.
let _langPref = (localStorage.getItem(LS_LANG_EXPLICIT) === '1')
  ? (localStorage.getItem(LS_LANG) || 'es')
  : 'es';
let _lang = (_langPref === 'auto') ? _deviceLangCode() : _langPref;
localStorage.setItem(LS_LANG, _langPref);

// iOS/Android fire this when the system language changes while the app is
// running (and Capacitor forwards it on resume), so Auto tracks it live.
window.addEventListener('languagechange', function() {
  if (_langPref === 'auto' && _lang !== _deviceLangCode()) setLanguage('auto');
});

const _i18n = {
  // ── Auth ──
  'Sign In':'Iniciar Sesión','Create Account':'Crear Cuenta',
  'Forgot password?':'¿Olvidaste tu contraseña?',
  'Forgot password? Reset password':'¿Olvidaste tu contraseña? Restablecer contraseña',
  'Email Address':'Correo Electrónico',
  'Your password':'Tu contraseña','Min. 8 characters':'Mín. 8 caracteres',
  'Full Name':'Nombre Completo','Send Reset Link':'Enviar Enlace',
  '← Back to Sign In':'← Volver a Iniciar Sesión','New Password':'Nueva Contraseña',
  'Confirm Password':'Confirmar Contraseña','Set New Password':'Establecer Nueva Contraseña',
  'Password':'Contraseña','Repeat password':'Repetir contraseña',
  'Enter your email address and we\'ll send you a link to reset your password.':'Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.',
  'Enter your new password below.':'Ingresa tu nueva contraseña a continuación.',

  // ── Top bar / Status ──
  'Online':'En Línea','Offline':'Sin Conexión','REMOTE':'REMOTO',

  // ── Scale display ──
  'Tare':'Tara','Clear':'Anular','Unload':'Descargar','Save':'Guardar',
  'Waiting':'Esperando','Stable':'Estable','Stabilising...':'Estabilizando...','spread':'dispersión','Gross':'Bruto','Net':'Neto',
  'Remote':'Remoto','UNLOADING':'DESCARGANDO','On Scale':'En Báscula',

  // ── Info rows ──
  'No Field':'Sin Campo','No Farm':'Sin Finca','No Zone':'Sin Zona','Default':'Predeterminado','No Truck':'Sin Camión',
  'No Crop':'Sin Cultivo','Select Destination':'Seleccionar Destino',
  'No Destination':'Sin Destino','Unloaded':'Descargado','Operator':'Operador',
  'No Operator Selected':'Ningún Operador Seleccionado','No Devices':'Sin Dispositivos',
  'Capacity not set':'Capacidad no configurada','Empty Truck':'Vaciar Camión',

  // ── Entry form ──
  'Crop':'Cultivo','Moisture %':'Humedad %','Season':'Temporada',
  'Canola':'Canola','Chia':'Chía','Corn':'Maíz','Cotton':'Algodón','Oats':'Avena',
  'Peanuts':'Maní','Rice':'Arroz','Soybeans':'Soja','Sorghum':'Sorgo','Sunflower':'Girasol','Wheat':'Trigo',
  '+ Add new crop...':'+ Agregar nuevo cultivo...',
  'No custom crops added yet':'No se han agregado cultivos personalizados',
  'No Season':'Sin Temporada','Notes':'Notas',

  // ── Fields ──
  'Farms':'Fincas','+ Farm':'+ Finca','Farm name...':'Nombre de finca...',
  'Add':'Agregar','+ Field':'+ Campo','Field name...':'Nombre de campo...',
  'Farm':'Finca','Total Harvested':'Total Cosechado','Total Area':'Área Total',

  // ── Trucks ──
  'Trucks':'Camiones','+ Truck':'+ Camión','No trucks added yet':'No hay camiones agregados',
  'Add New Truck':'Agregar Nuevo Camión','Truck Name *':'Nombre del Camión *',
  'Licence Plate *':'Matrícula *','Driver Name':'Nombre del Conductor',
  'Capacity (kg)':'Capacidad (kg)','Make / Model':'Marca / Modelo',
  'Truck':'Camión','Save Truck':'Guardar Camión','Capacity:':'Capacidad:',
  'Edit Truck':'Editar Camión',

  // ── Destinations ──
  'Destinations / Bins':'Destinos / Silos','+ Destination':'+ Destino',
  'No destinations added yet':'No hay destinos agregados','Destination':'Destino',

  // ── More menu ──
  'More':'Más','Connection Mode':'Modo de Conexión','Primary (BLE)':'Primario (BLE)',
  'Remote (WiFi read-only)':'Remoto (WiFi solo lectura)',
  'Primary':'Primario','Remote':'Remoto','Local':'Local',
  'Primary device — controls the scale':'Dispositivo primario — controla la báscula',
  'Remote device — receives data from primary':'Dispositivo remoto — recibe datos del primario',
  'Operators':'Operadores','Devices':'Dispositivos',
  'Settings':'Configuración','Cloud Sync':'Sincronización en la Nube',
  'Field Map':'Mapa de Campos','About':'Acerca de',
  'Not signed in':'No conectado','Sign Out':'Cerrar Sesión',
  'Tap to sign in or create account':'Toca para iniciar sesión o crear cuenta',
  'Signed in as':'Conectado como',

  // ── Settings ──
  'Dest':'Dest','Device':'Equipo','Diagnostics':'Diagnóstico',
  'Units':'Unidades','Weight':'Peso','Scale display unit':'Unidad de visualización',
  'Temperature':'Temperatura','Weather & conditions':'Clima y condiciones',
  'Area':'Área','Field measurements':'Mediciones de campo',
  'Auto-Unload Detection':'Detección de Descarga Automática',
  'Drop Trigger':'Disparador de Caída','Data':'Datos',
  'Clear Local Data':'Borrar Datos Locales',
  'Clear Local Transactions':'Borrar Transacciones Locales',
  'Sync complete':'Sincronización completa','Sync failed':'Error de sincronización',
  'Clear Local Transactions?':'¿Borrar Transacciones Locales?',
  'Loads only, this device — farms, fields and trucks are kept':'Solo cargas, este dispositivo — fincas, campos y camiones se conservan',
  'Display Rounding':'Redondeo de Pantalla',
  'Idle Timeout':'Tiempo de Inactividad',
  'Scale Power Saving':'Ahorro de Batería de la Báscula',
  '30 min':'30 min','1 hr':'1 h','2 hr':'2 h','Off':'Apagado',
  'Check for Firmware Updates':'Buscar Actualizaciones de Firmware',
  'Tap to check for the latest version':'Toca para buscar la última versión',
  'Update available: v':'Actualización disponible: v',
  'Grain Mixers':'Tolvas','Add Mixer':'Agregar Tolva',
  'Add Grain Mixer':'Agregar Tolva','Edit Grain Mixer':'Editar Tolva',
  'Mixer Name':'Nombre de la Tolva','Scale':'Báscula',
  'Scan & Connect Scale':'Buscar y Conectar Báscula',
  'No scale connected yet — tap Scan.':'Aún no hay báscula conectada — toca Buscar.',
  'Searching for a Virtus module…':'Buscando un módulo Virtus…',
  'No mixers yet — tap Add Mixer to name one and pair its scale':'Aún no hay tolvas — toca Agregar Tolva para nombrar una y vincular su báscula',
  'Remove Mixer?':'¿Eliminar Tolva?','Selected':'Seleccionado',
  'Scale in Sleep Mode':'Báscula en Modo de Suspensión',
  'The scale is conserving battery after a period of inactivity. Tap Wake to resume weighing.':'La báscula está ahorrando batería tras un período de inactividad. Toca Despertar para continuar pesando.',
  'Wake':'Despertar',
  'Unrecognized Scale':'Báscula No Reconocida',
  'This scale could not be verified as genuine Virtus hardware. For your data\'s integrity, the app works only with authentic Virtus scales.':'No se pudo verificar que esta báscula sea un equipo Virtus genuino. Para proteger tus datos, la app solo funciona con básculas Virtus auténticas.',
  'Disconnect':'Desconectar',
  'Dark Mode':'Modo Oscuro','Auto':'Auto','Light':'Claro','Dark':'Oscuro',
  'Theme: ':'Tema: ',
  'Weight Unit':'Unidad de Peso',
  'The unit used to display and record weights throughout the app — kilograms, pounds, or bushels. Changing it reformats every reading and log entry.':'La unidad usada para mostrar y registrar pesos en toda la app — kilogramos, libras o bushels. Cambiarla reformatea cada lectura y registro.',
  'Area Unit':'Unidad de Área',
  'The unit used for field sizes and yield calculations — hectares or acres. Affects the per-area figures shown on fields and farms.':'La unidad usada para el tamaño de campos y cálculos de rendimiento — hectáreas o acres. Afecta las cifras por área mostradas en campos y fincas.',
  'The display language for the app interface. Your data is unaffected.':'El idioma de la interfaz de la app. Tus datos no se ven afectados.',
  'How much weight must come off the mixer before an unload is auto-detected. Lower catches smaller dumps but is more sensitive to bounce; higher is steadier. Set to 0 to turn auto-unload off.':'Cuánto peso debe salir del carro antes de que se detecte automáticamente una descarga. Un valor más bajo detecta descargas pequeñas pero es más sensible al rebote; uno más alto es más estable. Ajusta a 0 para desactivar la descarga automática.',
  'After the screen sits idle this long, the app tells the connected scale to enter a low-power mode to save the module battery. Any tap wakes it again. Set to Off to keep the scale fully active.':'Después de que la pantalla esté inactiva este tiempo, la app le indica a la báscula conectada que entre en modo de bajo consumo para ahorrar batería. Cualquier toque la despierta de nuevo. Ajusta a Apagado para mantener la báscula siempre activa.',
  'Wipes all harvest logs stored on this device. Records already synced to the cloud are not affected. This cannot be undone.':'Borra todos los registros de cosecha almacenados en este dispositivo. Los registros ya sincronizados con la nube no se ven afectados. Esto no se puede deshacer.',
  'How closely the big weight number tracks the scale. The scale itself reports full 1 kg precision — this only smooths what\'s shown, so the display doesn\'t flicker on a bouncy load. Saved transaction weights are unaffected.':'Qué tan de cerca sigue el número grande de peso a la báscula. La báscula reporta precisión completa de 1 kg — esto solo suaviza lo que se muestra, para que la pantalla no parpadee con una carga inestable. Los pesos de transacciones guardadas no se ven afectados.',
  'Close':'Cerrar',
  'Firmware v':'Firmware v','available':'disponible',
  'In-app updating runs in the Virtus iOS app. On the web, download the update file and flash it with the nRF Device Firmware Update app (put the scale in update mode first).':
    'La actualización dentro de la app funciona en la app de Virtus para iOS. En la web, descarga el archivo de actualización y grábalo con la app nRF Device Firmware Update (primero pon la báscula en modo de actualización).',
  'Download update file':'Descargar archivo de actualización',
  'Wipe logs from this device':'Borrar registros de este dispositivo',
  'Language':'Idioma','App language':'Idioma de la aplicación',

  // ── Cloud Sync ──
  'Pending Records':'Registros Pendientes','Last Synced':'Última Sincronización',
  'Connection':'Conexión','Never':'Nunca','All synced ✓':'Todo sincronizado ✓',
  'Sync':'Sincronizar',

  // ── Devices ──
  'Bluetooth Scale':'Báscula Bluetooth','Scan for Devices':'Buscar Dispositivos',
  'Scanning...':'Buscando...','Connect':'Conectar','Disconnect':'Desconectar',
  'Connected':'Conectado','Weight Device':'Dispositivo de Peso','Model':'Modelo',
  'Serial Number':'Número de Serie','Firmware Version':'Versión de Firmware',
  'Battery':'Batería','Input Voltage':'Voltaje de Entrada',
  'Calibration Tool':'Herramienta de Calibración',
  'Firmware Updates':'Actualizaciones de Firmware','Check':'Verificar',
  'Good':'Bueno','Low':'Baja','Please Charge':'Por Favor Cargar',
  'Calibration':'Calibración','Zero Scale':'Tarar Báscula','Sensitivity':'Sensibilidad',
  'Permanently re-zeros the scale':'Pone la báscula a cero permanentemente',
  'Zero':'Cero','Diagnostics Terminal':'Terminal de Diagnóstico',
  'Run Diagnostics':'Ejecutar Diagnóstico','Send Email':'Enviar Correo','Clear Event Log':'Borrar Registro de Eventos',
  'Report ready — tap Send Email to dispatch':'Informe listo — toca Enviar Correo para enviarlo',
  'Connect a scale first':'Conecta una báscula primero','Connect a scale first (tap Scan)':'Conecta una báscula primero (toca Buscar)',
  'Checking…':'Buscando…','Update available:':'Actualización disponible:','Update':'Actualizar',
  'Up to date':'Actualizado','Could not check for updates':'No se pudo buscar actualizaciones',
  'Send Report To':'Enviar Informe a',
  'Tap Scan to find nearby Bluetooth scales':'Toca Buscar para encontrar básculas Bluetooth cercanas',
  'Run diagnostics first, then send via your email app':'Ejecuta el diagnóstico primero, luego envía por correo',
  'Check via scale WiFi connection':'Verificar vía conexión WiFi de la báscula',

  // ── Operators ──
  'Active Operator':'Operador Activo','+ Operator':'+ Operador',
  'Tap an operator below to select':'Toca un operador abajo para seleccionar',
  'Add Operator':'Agregar Operador','Edit Operator':'Editar Operador',
  'Name *':'Nombre *','Select Operator':'Seleccionar Operador',

  // ── Season ──
  'Active Season':'Temporada Activa','No Season Selected':'Sin Temporada Seleccionada',
  'Created':'Creada','Select or create a season below':'Selecciona o crea una temporada abajo',
  '+ Season':'+ Temporada','Add Season':'Agregar Temporada',
  'Edit Season':'Editar Temporada','Season Name *':'Nombre de Temporada *',
  'Transactions':'Transacciones',

  // ── Field Map ──
  'All Fields':'Todos los Campos','Current Field':'Campo Actual',
  'Logged Entries':'Entradas Registradas','Draw Boundary':'Añadir Límite','My Location':'Mi Ubicación',
  'Undo':'Deshacer','Cancel':'Cancelar',
  'No GPS data found for any field or transaction yet.':'No se encontraron datos GPS para ningún campo o transacción.',
  'Tap the map to place boundary points':'Toca el mapa para colocar puntos de límite',
  '0 points':'0 puntos',

  // ── About ─���
  'Version':'Versión','Platform':'Plataforma',
  'Android App':'Aplicación Android','iOS App':'Aplicación iOS',
  'Web App (iPad)':'Aplicación Web (iPad)','Web App (Android)':'Aplicación Web (Android)',
  'Web App (iPhone)':'Aplicación Web (iPhone)','Web App':'Aplicación Web',

  // ── Modals & Sheets ──
  'Select Unload Location':'Seleccionar Ubicación de Descarga',
  'Add New Field':'Agregar Nuevo Campo',
  // openAddNameSheet()'s titles/labels — were only ever defined as English
  // keys with no dictionary entry, so T() silently fell back to English.
  'Add New Farm':'Agregar Nueva Finca','Add New Destination':'Agregar Nuevo Destino',
  'Farm name *':'Nombre de la Finca *','Field name *':'Nombre del Campo *',
  'Destination / bin name *':'Nombre de Destino / Silo *',
  'Manage Crops':'Gestionar Cultivos','Add New Crop':'Agregar Nuevo Cultivo',
  'Add Crop':'Agregar Cultivo','Adding to':'Agregando a','for yield calc':'para cálculo de rendimiento',
  'Crop name e.g. Wheat...':'Nombre del cultivo ej. Trigo...',
  'Select Farm & Field':'Seleccionar Finca y Campo',
  'Select Farm':'Seleccionar Finca','Select Field':'Seleccionar Campo',
  'Select Truck':'Seleccionar Camión','Unload to Truck':'Descargar al Camión',
  'No truck selected':'Sin camión seleccionado',
  "You've entered a field":'Has entrado a un campo',
  'Field Name':'Nombre del Campo','Stay':'Quedarse','Switch Field':'Cambiar Campo',
  'Delete':'Eliminar','Profile Photo':'Foto de Perfil',
  'Choose how to add your photo':'Elige cómo agregar tu foto',
  'Take Photo':'Tomar Foto','Choose from Gallery':'Elegir de Galería',
  'Remove Photo':'Eliminar Foto','Edit Field':'Editar Campo',
  'Edit Farm':'Editar Finca','Edit Destination':'Editar Destino','Edit':'Editar',
  'Save Field':'Guardar Campo','Primary Crop':'Cultivo Principal',
  'No crop assigned':'Sin cultivo asignado','optional':'opcional',
  'Auto-calculated from drawn boundary':'Calculado automáticamente del límite dibujado',
  'See Location':'Ver Ubicación',

  // ── Transaction sheet ──
  'Add Transaction':'Agregar Transacción','Weight *':'Peso *','Crop *':'Cultivo *',
  'Field':'Campo','Dry Weight':'Peso Seco','Optional notes...':'Notas opcionales...',
  'Save Transaction':'Guardar Transacción','Tap to select':'Toca para seleccionar',

  // ── Info popups (ⓘ) ──
  'Clear Cloud Data':'Borrar Datos de la Nube',
  'How much signal the load cells produce at full rated load, per volt of excitation. It is printed on the load cell datasheet — 2.0 mV/V is the most common. All cells in one scale should match. Changing this rescales the raw reading, so recalibrate with a known weight afterwards.':
    'Cuánta señal producen las celdas de carga a la carga nominal completa, por voltio de excitación. Está impreso en la hoja de datos de la celda de carga — 2.0 mV/V es lo más común. Todas las celdas de una báscula deben coincidir. Cambiar esto reescala la lectura cruda, así que recalibra con un peso conocido después.',
  "The combined rated capacity of ALL load cells, in kg. Example: 4 cells of 5000 kg each = 20000. This sets the scale's expected full range. Changing it rescales the raw reading, so recalibrate with a known weight afterwards.":
    'La capacidad nominal combinada de TODAS las celdas de carga, en kg. Ejemplo: 4 celdas de 5000 kg cada una = 20000. Esto define el rango completo esperado de la báscula. Cambiarla reescala la lectura cruda, así que recalibra con un peso conocido después.',
  'The true weight of your test load — from a certified scale ticket or known test weights. Used together with the Scale Reading to calculate the calibration factor.':
    'El peso verdadero de tu carga de prueba — de un ticket de báscula certificado o pesos de prueba conocidos. Se usa junto con la Lectura de Báscula para calcular el factor de calibración.',
  'What this scale shows for that same test load, before correction. Use the copy button to fill it from the live reading while the load is on the scale.':
    'Lo que esta báscula muestra para esa misma carga de prueba, antes de la corrección. Usa el botón de copiar para llenarlo desde la lectura en vivo mientras la carga está en la báscula.',
  "Sets the scale's permanent zero point, stored on the device and kept after power-off. Use it when the scale is empty and reads something other than zero.\n\nFor a temporary zero — such as subtracting a container or an already-loaded truck — use Tare on the Weight Display instead.":
    'Establece el punto cero permanente de la báscula, guardado en el dispositivo y conservado después de apagarla. Úsalo cuando la báscula esté vacía y muestre algo distinto de cero.\n\nPara un cero temporal — como restar un contenedor o un camión ya cargado — usa Tara en la Pantalla de Peso en su lugar.',
  'The correction multiplier stored inside the scale: displayed weight = raw reading × factor. It is calculated from Certified Weight ÷ Scale Reading, or you can type one directly. It is saved in the scale\'s own memory and survives power-off.':
    'El multiplicador de corrección guardado dentro de la báscula: peso mostrado = lectura cruda × factor. Se calcula con Peso Certificado ÷ Lectura de Báscula, o puedes escribir uno directamente. Se guarda en la memoria propia de la báscula y sobrevive el apagado.',
  'The unit used to display and record weights throughout the app — kilograms, pounds, or bushels. Changing it reformats every reading and log entry.':
    'La unidad usada para mostrar y registrar pesos en toda la app — kilogramos, libras o bushels. Cambiarla reformatea cada lectura y registro.',
  'The unit used for field sizes and yield calculations — hectares or acres. Affects the per-area figures shown on fields and farms.':
    'La unidad usada para el tamaño de campos y cálculos de rendimiento — hectáreas o acres. Afecta las cifras por área mostradas en campos y fincas.',
  'The display language for the app interface. Your data is unaffected.':
    'El idioma de la interfaz de la app. Tus datos no se ven afectados.',
  'How much weight must come off the mixer before an unload is auto-detected. Lower catches smaller dumps but is more sensitive to bounce; higher is steadier. Set to 0 to turn auto-unload off.':
    'Cuánto peso debe salir de la tolva antes de que se detecte automáticamente una descarga. Un valor más bajo detecta descargas más pequeñas pero es más sensible al rebote; uno más alto es más estable. Ponlo en 0 para desactivar la descarga automática.',
  'After the screen sits idle this long, the app tells the connected scale to enter a low-power mode to save the module battery. Any tap wakes it again. Set to Off to keep the scale fully active.':
    'Después de que la pantalla esté inactiva este tiempo, la app le indica a la báscula conectada que entre en modo de bajo consumo para ahorrar la batería del módulo. Cualquier toque la despierta de nuevo. Ponlo en Apagado para mantener la báscula siempre activa.',
  'Wipes all harvest logs stored on this device. Records already synced to the cloud are not affected. This cannot be undone.':
    'Borra todos los registros de cosecha guardados en este dispositivo. Los registros ya sincronizados con la nube no se ven afectados. Esto no se puede deshacer.',
  "Deletes your account's data from the cloud database, affecting every device signed into this account. You can choose to remove just transaction records, or everything — farms, fields, trucks, destinations, operators, crops, boundaries, and grain mixers. This cannot be undone.":
    'Elimina los datos de tu cuenta de la base de datos en la nube, afectando cada dispositivo con sesión iniciada en esta cuenta. Puedes elegir eliminar solo los registros de transacciones, o todo — fincas, campos, camiones, destinos, operadores, cultivos, límites y tolvas. Esto no se puede deshacer.',
  "How closely the big weight number tracks the scale. The scale itself reports full 1 kg precision — this only smooths what's shown, so the display doesn't flicker on a bouncy load. Saved transaction weights are unaffected.":
    'Qué tan de cerca sigue el número grande de peso a la báscula. La báscula reporta precisión completa de 1 kg — esto solo suaviza lo que se muestra, para que la pantalla no parpadee con una carga inestable. Los pesos de transacciones guardadas no se ven afectados.',

  // ── Calibration sheet ──
  'Sensitivity (mV/V)':'Sensibilidad (mV/V)','Rated Capacity':'Capacidad Nominal',
  'Certified Weight':'Peso Certificado','Scale Reading':'Lectura de Báscula',
  'Known true weight':'Peso verdadero conocido',
  'What scale shows':'Lo que muestra la báscula',
  'Calculate Calibration Factor':'Calcular Factor de Calibración',
  'Calibration Factor':'Factor de Calibración',
  'Edit below to override':'Editar abajo para anular',
  'Scale is perfectly calibrated ✓':'La báscula está calibrada perfectamente ✓',
  'Scale reads LOW by':'La báscula lee BAJO por','Scale reads HIGH by':'La báscula lee ALTO por',
  'Apply':'Aplicar','Save Settings':'Guardar Configuración',

  // ── Login prompt ──
  'Sign in to sync your data':'Inicia sesión para sincronizar tus datos',
  'Save to cloud & access all features':'Guardar en la nube y acceder a todas las funciones',
  'Skip':'Omitir','Sign In / Sign Up':'Iniciar Sesión / Registrarse',
  'Reset Password':'Restablecer Contraseña',

  // ── Tab labels ──
  'Display':'Pantalla','Fields':'Campos','Destinations':'Destinos',

  // ── Wheel picker ──
  'Select':'Seleccionar','+ Add New':'+ Agregar Nuevo','Done':'Listo',

  // ── Confirm dialogs ──
  'Sign Out?':'¿Cerrar Sesión?',
  'End your session and sign out?':'¿Terminar tu sesión y cerrar sesión?',
  'Delete Field?':'¿Eliminar Campo?',
  'Are you sure you want to delete this field? This cannot be undone.':'¿Estás seguro de que deseas eliminar este campo? Esto no se puede deshacer.',
  'Remove Destination?':'¿Eliminar Destino?',
  'Remove Truck?':'¿Eliminar Camión?',
  'Delete Transaction?':'¿Eliminar Transacción?',
  'Are you sure you want to delete this transaction?':'¿Estás seguro de que deseas eliminar esta transacción?',
  'Delete Farm?':'¿Eliminar Finca?',
  'Remove':'Eliminar',
  'Remove this destination? All transactions delivered here will also be permanently deleted.':'¿Eliminar este destino? Todas las transacciones entregadas aquí también serán eliminadas permanentemente.',
  'All transactions logged under this truck will also be permanently deleted.':'Todas las transacciones registradas bajo este camión también serán eliminadas permanentemente.',
  'this truck':'este camión',
  'Are you sure you want to delete this transaction? This cannot be undone.':'¿Estás seguro de que deseas eliminar esta transacción? Esto no se puede deshacer.',
  'Delete this field? All transactions logged under it will also be permanently deleted.':'¿Eliminar este campo? Todas las transacciones registradas bajo él también serán eliminadas permanentemente.',
  'and all its fields? All transactions logged under this farm will also be permanently deleted.':'y todos sus campos? Todas las transacciones registradas bajo esta finca también serán eliminadas permanentemente.',
  'All transactions logged under this season will also be permanently deleted.':'Todas las transacciones registradas bajo esta temporada también serán eliminadas permanentemente.',
  'Not signed in':'Sin sesión iniciada',
  'Sign Out?':'¿Cerrar Sesión?','Sign out of your account?':'¿Cerrar sesión de tu cuenta?',
  'Restore Device?':'¿Restaurar Dispositivo?',
  'Reset all calibration settings to factory defaults. This cannot be undone.':'Restablecer toda la calibración a valores de fábrica. Esto no se puede deshacer.',
  'Restore':'Restaurar',
  'Remove Operator?':'¿Eliminar Operador?',
  'Delete Season?':'¿Eliminar Temporada?',
  'Scale WiFi Detected':'WiFi de Báscula Detectado',
  'Connected to VirtusScale WiFi. Open in Remote Mode (view only) or use BLE for full access?':'Conectado al WiFi de VirtusScale. ¿Abrir en Modo Remoto (solo lectura) o usar BLE para acceso completo?',
  'Remote Mode':'Modo Remoto',
  'Clear All Data?':'¿Borrar Todos los Datos?',
  'This will delete all transaction records from this device AND from the cloud database. This cannot be undone.':'Esto eliminará todos los registros de transacciones de este dispositivo Y de la base de datos en la nube. Esto no se puede deshacer.',
  'Delete All':'Eliminar Todo',
  'Change Crop?':'¿Cambiar Cultivo?',
  'Switch Crop?':'¿Cambiar Cultivo?','Switch crop from':'Cambiar cultivo de','to':'a',
  'How do I change the field\'s crop?':'¿Cómo cambio el cultivo del campo?',
  'Keep':'Mantener','Continue with':'Continuar con','or switch crop?':'¿o cambiar cultivo?',
  'Switch crop':'Cambiar cultivo','Just this load':'Solo esta carga','already has':'ya tiene',
  'or switch crop':'o cambiar cultivo',
  'Loaded':'Cargado','crop updated to':'cultivo actualizado a',
  'Truck Full':'Camión Lleno','would be at':'estaría al','Unload anyway':'Descargar de todos modos',
  'Empty truck & switch':'Vaciar camión y cambiar','Unload discarded — no truck selected':'Descarga descartada — ningún camión seleccionado',
  'Account':'Cuenta','Delete Account':'Eliminar Cuenta','Delete Account?':'¿Eliminar Cuenta?',
  'Permanently deletes your account and all its data':'Elimina permanentemente su cuenta y todos sus datos',
  'This permanently deletes your account and every record in it — loads, fields, trucks and seasons. It cannot be undone.':'Esto elimina permanentemente su cuenta y todos sus registros — cargas, campos, camiones y temporadas. No se puede deshacer.',
  'Type':'Escriba','to confirm':'para confirmar',
  'Account deleted':'Cuenta eliminada','Could not delete account':'No se pudo eliminar la cuenta',
  'Sign in required to delete your account':'Inicie sesión para eliminar su cuenta','Different Crop On Truck':'Cultivo Diferente en el Camión',
  'is already carrying':'ya lleva','Unloading':'Descargar',
  'will mix the load. Change the crop, or empty the truck first.':'mezclará la carga. Cambie el cultivo o vacíe el camión primero.',
  'Unload anyway':'Descargar de todos modos',
  'Field Crop':'Cultivo del Campo',
  'This season already has':'Esta temporada ya tiene',
  'load':'carga','recorded as':'registradas como','Switch to':'Cambiar a',
  'Yes, switch':'Sí, cambiar',
  'Crop Mismatch':'Cultivo No Coincide',
  'is assigned to':'está asignado a','Switch crop to':'¿Cambiar cultivo a',
  'Update field':'Actualizar campo',
  'Are you sure?':'¿Estás seguro?',
  'This cannot be undone.':'Esto no se puede deshacer.',

  // ── Toast messages ──
  'Enter your name':'Ingresa tu nombre',
  'PIN must be 4+ digits':'El PIN debe tener 4+ dígitos',
  'Enter email and password.':'Ingresa correo y contraseña.',
  'Signing in…':'Iniciando sesión…','Sign in failed.':'Error al iniciar sesión.',
  'Tare set':'Tara establecida','Tare cleared':'Tara eliminada',
  'Enter a valid weight':'Ingresa un peso válido',
  'Transaction deleted':'Transacción eliminada',
  'Boundary deleted':'Límite eliminado',
  'Connect to the scale first':'Conecta la báscula primero',
  'Connected — no weight service found. Use manual input.':'Conectado — no se encontró servicio de peso. Usa entrada manual.',
  'Local data cleared':'Datos locales borrados',
  'No destinations yet — add one in the Destinations tab':'Sin destinos aún — agrega uno en la pestaña Destinos',
  'No orphaned boundaries found':'No se encontraron límites huérfanos',
  'No reading':'Sin lectura',
  'Open the app via http:// or use the scale display link in Devices':'Abre la app vía http:// o usa el enlace de la báscula en Dispositivos',
  'Password reset cancelled':'Restablecimiento de contraseña cancelado',
  'Select a field to complete the save':'Selecciona un campo para completar el guardado',
  'Select a truck to complete the save':'Selecciona un camión para completar el guardado',
  'Sign in required to clear cloud data':'Inicia sesión para borrar datos de la nube',
  'The scale assigns primary automatically':'La báscula asigna la principal automáticamente',
  'Weight is zero - check tare':'El peso es cero - revisa la tara',
  'Transaction updated':'Transacción actualizada',
  'Transaction added':'Transacción agregada',
  'Enter a field name':'Ingresa un nombre de campo',
  'Open a farm first':'Abre una finca primero',
  'Field already exists in this farm':'El campo ya existe en esta finca',
  'Enter a farm name':'Ingresa un nombre de finca',
  'Farm already exists':'La finca ya existe',
  'Field deleted':'Campo eliminado',
  'Truck name is required':'El nombre del camión es requerido',
  'Licence plate is required':'La matrícula es requerida',
  'Capacity saved':'Capacidad guardada',
  'No scale connected':'Sin báscula conectada',
  'Zero sent to scale':'Cero enviado a la báscula',
  'No weight reading':'Sin lectura de peso',
  'Enter a destination name':'Ingresa un nombre de destino',
  'Already exists':'Ya existe','Connecting…':'Conectando…',
  'Disconnected':'Desconectado','No device selected':'Sin dispositivo seleccionado',
  'Firmware is up to date':'El firmware está actualizado',
  'Boundary saved':'Límite guardado',
  'Auto-unload cancelled':'Descarga automática cancelada',
  'Season name required':'Nombre de temporada requerido',
  'Season added':'Temporada agregada','Name required':'Nombre requerido',
  'Operator updated':'Operador actualizado','Operator added':'Operador agregado',
  'Signed out':'Sesión cerrada',
  'Sign in required to sync':'Inicio de sesión requerido para sincronizar',
  'Pulling config…':'Descargando configuración…',
  'Config sync failed':'Error al sincronizar configuración',
  'Field updated':'Campo actualizado','Farm updated':'Finca actualizada',
  'Destination updated':'Destino actualizado',
  'Diagnostics complete':'Diagnóstico completado',
  'Enter an email address first':'Ingresa una dirección de correo primero',
  'No live weight reading':'Sin lectura de peso en vivo',
  'Live weight copied':'Peso en vivo copiado',
  'Calibration settings saved':'Configuración de calibración guardada',
  'Device restored to defaults':'Dispositivo restaurado a valores predeterminados',
  'Profile photo updated':'Foto de perfil actualizada',
  'Photo removed':'Foto eliminada',
  'Select a season first':'Selecciona una temporada primero',
  'Select a field to complete saving your transaction':'Selecciona un campo para completar tu transacción',
  'No farms yet':'Sin fincas aún',
  'No farms yet — add one below':'Aún no hay fincas — agrega una abajo',
  'No farms yet — add one using the button below':'Aún no hay fincas — agrega una con el botón de abajo',
  'No fields — add one below':'Sin campos — agrega uno abajo',
  'No operators yet — add one below':'Aún no hay operadores — agrega uno abajo',
  'No seasons yet — add one below':'Aún no hay temporadas — agrega una abajo',
  'No fields yet':'Sin campos aún',
  'Downloading firmware…':'Descargando firmware…','Preparing scale…':'Preparando báscula…',
  'Looking for scale…':'Buscando báscula…',
  'Installing…':'Instalando…','Firmware updated':'Firmware actualizado',
  'Update failed':'Error al actualizar','Firmware update failed':'Error al actualizar el firmware',
  'Retry':'Reintentar',
  'Firmware updates are not supported on this device yet — use nRF Connect.':'Las actualizaciones de firmware aún no están disponibles en este dispositivo — usa nRF Connect.',
  'Wet':'Húmedo','Dry':'Seco','moisture':'humedad','Dest':'Destino',
  'Awaiting delivery':'Pendiente de entrega',
  'Disconnect':'Desconectar','Connected — not linked to a mixer':'Conectado — sin tolva vinculada',
  'Scale not nearby — tap Scan to find it':'Báscula no está cerca — toca Escanear para encontrarla',
  'Connect':'Conectar','Connecting to':'Conectando a',
  'Connect to your scale first — the update installs straight over Bluetooth.':'Conecta tu báscula primero — la actualización se instala directamente por Bluetooth.',
  'Custom':'Personalizado','Custom Moisture':'Humedad Personalizada',
  'Enter a moisture between 0 and 60%':'Ingresa una humedad entre 0 y 60%',
  'No fields yet — tap + Field to add one':'Sin campos aún — toca + Campo para agregar',
  'No fields under this farm yet — tap + Field':'Aún no hay campos en esta finca — toca + Campo',
  'Select field':'Selecciona campo','tap map to add':'toca el mapa para agregar',
  'Drag the points to adjust':'Arrastra los puntos para ajustar',
  'points':'puntos','point':'punto',
  'Truck removed':'Camión eliminado','Destination removed':'Destino eliminado',
  'Farm deleted':'Finca eliminada','Season deleted':'Temporada eliminada',
  'transaction':'transacción','transactions':'transacciones','removed':'eliminadas',
  'Total Loaded':'Total Cargado','Total Delivered':'Total Entregado',
  'all time':'histórico','total':'total','Season Total':'Total de Temporada',
  'Set field areas':'Define las áreas de los campos',
  'all fields':'todos los campos',
  'No fields under this farm yet.':'Aún no hay campos en esta finca.',
  'No fields yet — add one below':'Sin campos aún — agrega uno abajo',
  'Yield':'Rendimiento','Set area in Edit':'Establece área en Editar',
  'Field Area':'Área del Campo','field size':'tamaño del campo',
  'All Transactions':'Todas las Transacciones',
  '+ Add new field...':'+ Agregar nuevo campo...',
  'Add Transaction':'Agregar Transacción','Delete':'Eliminar',
  'No farm selected':'Sin finca seleccionada',
  'tap to pick field':'toca para elegir campo',
  'Tap to select field':'Toca para seleccionar campo',
  'No fields yet — add one in the Fields tab':'Sin campos aún — agrega uno en la pestaña Campos',
  'No trucks yet — add one in the Trucks tab':'Sin camiones aún — agrega uno en la pestaña Camiones',
  'No operators added yet':'No hay operadores agregados',
  'Truck is already empty':'El camión ya está vacío',
  'Select a truck first':'Selecciona un camión primero',
  'Select a destination first':'Selecciona un destino primero',
  'Now select a field':'Ahora selecciona un campo',
  'Auto-unload discarded — no field selected':'Descarga automática descartada — ningún campo seleccionado',
  'Auto-unload discarded — no truck selected':'Descarga automática descartada — ningún camión seleccionado',
  'Manual unload discarded — no truck selected':'Descarga manual descartada — ningún camión seleccionado',
  'Transaction not found':'Transacción no encontrada',
  'Truck not found':'Camión no encontrado',
  'GPS not available':'GPS no disponible',
  'GPS not available on this device':'GPS no disponible en este dispositivo',
  'Location unavailable':'Ubicación no disponible',
  'Requesting GPS…':'Solicitando GPS…',
  'Open Field Map first':'Abre el Mapa de Campos primero',
  'Need at least 3 points':'Se necesitan al menos 3 puntos',
  'Field name required':'Nombre de campo requerido',
  'Field not found':'Campo no encontrado',
  'Field switched':'Campo cambiado',
  'Password must be at least 8 characters.':'La contraseña debe tener al menos 8 caracteres.',
  'Passwords do not match.':'Las contraseñas no coinciden.',
  'Connection required.':'Se requiere conexión.',
  'Password updated! Please sign in with your new password.':'Contraseña actualizada. Inicia sesión con tu nueva contraseña.',
  'Could not update password.':'No se pudo actualizar la contraseña.',
  'Password updated successfully!':'¡Contraseña actualizada exitosamente!',
  'Not connected':'Sin conexión',
  'No operator':'Sin operador',
  'No farm selected':'Sin finca seleccionada',
  'Connect to scale first':'Conecta la báscula primero',
  'Scale not connected':'Báscula no conectada',
  'Update already in progress':'Actualización en progreso',
  'Firmware update in progress — please wait':'Actualización de firmware en curso — espere',
  'Could not check for update':'No se pudo verificar actualización',
  'Today':'Hoy','Yesterday':'Ayer',
  'Primary device':'Dispositivo primario',
  'Remote device':'Dispositivo remoto',
  'Remote mode �� live weight only':'Modo remoto — solo peso en vivo',
  'Unloading Detected':'Descarga Detectada',
  'Before':'Antes','Current':'Actual',
  'No transactions for this truck yet.':'No hay transacciones para este camión.',
  'Auto-unload detected — tracking…':'Descarga automática detectada — rastreando…',
  'Auto-unload detected — select a truck':'Descarga automática detectada — selecciona un camión',
  'Auto-unload detected — select a field':'Descarga automática detectada — selecciona un campo',
  'Downloading firmware…':'Descargando firmware…',
  'Firmware updated! Scale restarting…':'¡Firmware actualizado! Báscula reiniciando…',
  'Scale has no WiFi — add your network to the firmware':'La báscula no tiene WiFi — agrega tu red al firmware',
  'Firmware update failed':'Error en actualización de firmware',
  'Already on latest firmware':'Ya tienes el firmware más reciente',
  'Starting firmware update…':'Iniciando actualización de firmware…',
  'Checking for update…':'Verificando actualización…',
  'A primary device is already connected via BLE — cannot switch':'Un dispositivo primario ya está conectado vía BLE — no se puede cambiar',
  'Celsius':'Celsius','Fahrenheit':'Fahrenheit',
  'Hectares':'Hectáreas','Acres':'Acres',
  'Scale reading cannot be zero':'La lectura de la báscula no puede ser cero',
  'Weight is zero — check tare':'El peso es cero — verifica la tara',
  'Unload started — drive to unload, then press Save':'Descarga iniciada — conduce al punto de descarga, luego presiona Guardar',
  'No weight change detected':'No se detectó cambio de peso',
  'Scale is perfectly calibrated ✓':'La báscula está perfectamente calibrada ✓',
  'Enter the certified (true) weight':'Ingresa el peso certificado (verdadero)',
  'Enter what the scale is reading':'Ingresa lo que muestra la báscula',
  'Enter a valid factor (e.g. 1.025)':'Ingresa un factor válido (ej. 1.025)',
  'Enter both Certified Reading and Scale Reading':'Ingresa tanto la Lectura Certificada como la de la Báscula',
  'Scale disconnected':'Báscula desconectada',
  'No weight on scale to copy':'Sin peso en la báscula para copiar',
  'Advertisement watching not supported — try a different browser':'No compatible con este navegador — prueba otro',
  'Connect to your firmware update tool to update firmware':'Conecta tu herramienta de actualización para actualizar el firmware',
  'Unloaded weight too small':'El peso descargado es muy pequeño',
  'Weight unit: ':'Unidad de peso: ',
  'Temperature: ':'Temperatura: ',
  'Area unit: ':'Unidad de área: ',
  'Drop trigger: ':'Disparador de caída: ',
  'Minimum trigger is 250 ':'El disparador mínimo es 250 ',

  // ── Plurals / fragments ──
  ' added':' agregado/a',' updated':' actualizado/a',
  ' selected':' seleccionado/a',' created':' creado/a',
  ' record(s) pending':' registro(s) pendiente(s)',
  ' load(s)':' carga(s)',' transaction(s) removed':' transacción(es) eliminada(s)',
  'No transactions for this destination yet.':'No hay transacciones para este destino.',
  'Virtus Diagnostics v1.0':'Virtus Diagnóstico v1.0',
  'Tap "Run Diagnostics" to collect report...':'Toca "Ejecutar Diagnóstico" para recopilar el informe...',

  // ── Additional dynamic strings ──
  'Edit Transaction':'Editar Transacción',
  'No transactions recorded for this field yet.':'No hay transacciones registradas para este campo.',
  'Edit Truck':'Editar Camión',
  'No transactions received at this destination yet.':'No hay transacciones recibidas en este destino.',
  'Edit Operator':'Editar Operador',
  'Edit Season':'Editar Temporada',
  'Go to More → Operators to select':'Ve a Más → Operadores para seleccionar',
  'No Operator':'Sin Operador',
  'loads':'cargas','load':'carga',
  'fields':'campos','field':'campo',
  'records':'registros','record':'registro','pending':'pendientes',
};

function T(en) {
  if (_lang === 'en') return en;
  return _i18n[en] || en;
}

// Wraps a fragment that forms a whole question. Spanish opens with ¿, English
// doesn't — so the mark can't live inside a dictionary entry that is also used
// as a button label.
function _ask(s){ return (_lang === 'es' ? '¿' : '') + s + '?'; }

function setLanguage(pref) {
  _langPref = (pref === 'auto') ? 'auto' : pref;
  _lang     = (_langPref === 'auto') ? _deviceLangCode() : _langPref;
  localStorage.setItem(LS_LANG, _langPref);
  // Only a manual pick overrides the device; Auto explicitly hands control back.
  localStorage.setItem(LS_LANG_EXPLICIT, _langPref === 'auto' ? '0' : '1');
  document.documentElement.lang = _lang;
  applyLanguage();
  // Highlight the *preference*, not the resolved language — in Auto neither
  // English nor Español should look selected.
  document.querySelectorAll('#seg-lang .seg-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-lang') === _langPref);
  });
  // Re-render dynamic content
  if (typeof renderTrucks === 'function') renderTrucks();
  if (typeof renderDestinations === 'function') renderDestinations();
  if (typeof renderFarms === 'function') renderFarms();
  if (typeof renderFields === 'function') renderFields();
  if (typeof renderOperators === 'function') renderOperators();
  if (typeof renderSeasons === 'function') renderSeasons();
  if (typeof updateCloudPanel === 'function') updateCloudPanel();
  if (typeof updateProfileStrip === 'function') updateProfileStrip();
  if (typeof updateOperatorDisplay === 'function') updateOperatorDisplay();
  if (typeof updateNetPill === 'function') updateNetPill();
  if (typeof updateWeighDisplay === 'function') updateWeighDisplay();
  if (typeof updateSessionTotal === 'function') updateSessionTotal();
  if (typeof updateSeasonDisplayLabel === 'function') updateSeasonDisplayLabel();
}



function initLangToggle() {
  var seg = document.getElementById('seg-lang');
  if (!seg) return;
  seg.querySelectorAll('.seg-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-lang') === _langPref);
  });
}

function applyLanguage() {
  // ── Tab bar ──
  var tabMap = {display:'Main',tx:'Unloads',stock:'Ingredients',more:'More'};
  Object.keys(tabMap).forEach(function(id) {
    var el = document.getElementById('tab-'+id);
    if (el) { var lbl = el.querySelector('.tab-label'); if (lbl) lbl.textContent = T(tabMap[id]); }
  });

  // ── Auth screen ──
  var stSi = document.getElementById('stab-signin'); if (stSi) stSi.textContent = T('Sign In');
  var stSu = document.getElementById('stab-signup'); if (stSu) stSu.textContent = T('Create Account');
  // Sign In form labels
  document.querySelectorAll('#signin-form .signin-field label').forEach(function(lbl, i) {
    if (i === 0) lbl.textContent = T('Email Address');
    if (i === 1) lbl.textContent = T('Password');
  });
  var sBtn = document.getElementById('signin-btn'); if (sBtn && !sBtn.disabled) sBtn.textContent = T('Sign In');
  var fBtn = document.querySelector('#signin-form .signin-forgot'); if (fBtn) fBtn.textContent = T('Forgot password?');
  // Sign Up form labels
  document.querySelectorAll('#signup-form .signin-field label').forEach(function(lbl, i) {
    if (i === 0) lbl.textContent = T('Full Name');
    if (i === 1) lbl.textContent = T('Email Address');
    if (i === 2) lbl.textContent = T('Password');
  });
  var suBtn = document.getElementById('signup-btn'); if (suBtn) suBtn.textContent = T('Create Account');
  var suForgot = document.querySelector('#signup-form .signin-forgot'); if (suForgot) suForgot.textContent = T('Forgot password? Reset password');
  // Forgot password form
  var forgotBtn = document.getElementById('forgot-btn'); if (forgotBtn) forgotBtn.textContent = T('Send Reset Link');
  var backBtn = document.querySelector('#forgot-form .signin-forgot'); if (backBtn) backBtn.textContent = T('← Back to Sign In');
  // Reset form
  document.querySelectorAll('#reset-form .signin-field label').forEach(function(lbl, i) {
    if (i === 0) lbl.textContent = T('New Password');
    if (i === 1) lbl.textContent = T('Confirm Password');
  });
  var rBtn = document.getElementById('reset-btn'); if (rBtn && !rBtn.disabled) rBtn.textContent = T('Set New Password');

  // ── Placeholders ──
  var phMap = {
    'signin-email':'you@example.com','signin-password':T('Your password'),
    'signup-name':'','signup-email':'you@example.com',
    'signup-password':T('Min. 8 characters'),'forgot-email':'you@example.com',
    'reset-password':T('Min. 8 characters'),'reset-confirm':T('Repeat password'),
    'new-farm-input':T('Farm name...'),'new-field-input':T('Field name...'),
    'new-destination-input':'',
    'nt-name':'','nt-plate':'',
    'nt-driver':'','nt-capacity':'',
    'nt-model':'',
    'nt-notes':T('Optional notes...'),'tx-notes':T('Optional notes...'),
    'op-name-input':'',
    'season-name-input':'',
    'new-crop-input':'',
    'new-field-modal-input':'',
    'fes-name':T('Field name...'),'fes-notes':'',
  };
  Object.keys(phMap).forEach(function(id) {
    var el = document.getElementById(id); if (el) el.placeholder = phMap[id];
  });

  // ── Scale area ──
  var stTxt = document.getElementById('stable-txt'); if (stTxt) {
    if (stTxt.textContent === 'Waiting' || stTxt.textContent === 'Esperando') stTxt.textContent = T('Waiting');
    if (stTxt.textContent === 'Stable' || stTxt.textContent === 'Estable') stTxt.textContent = T('Stable');
  }
  var slblL = document.getElementById('scale-sub-lbl-left');
  var slblR = document.getElementById('scale-sub-lbl-right');
  if (slblL && (slblL.textContent === 'Gross' || slblL.textContent === 'Bruto')) slblL.textContent = T('Gross');
  if (slblR && (slblR.textContent === 'Net' || slblR.textContent === 'Neto')) slblR.textContent = T('Net');
  var swp = document.getElementById('scale-weight-prefix'); if (swp) swp.textContent = T('UNLOADING');

  // ── Action buttons ──
  document.querySelectorAll('.abtn-col').forEach(function(btn) {
    var txt = btn.textContent.trim();
    if (txt === 'Tare' || txt === 'Tara') btn.textContent = T('Tare');
    if (txt === 'Clear' || txt === 'Anular') btn.textContent = T('Clear');
    if (txt === 'Unload' || txt === 'Descargar') btn.textContent = T('Unload');
    if (txt === 'Save' || txt === 'Guardar') btn.textContent = T('Save');
  });
  var tlbCap = document.getElementById('tlb-capacity-lbl');
  if (tlbCap && (tlbCap.textContent === 'Capacity not set' || tlbCap.textContent === 'Capacidad no configurada')) tlbCap.textContent = T('Capacity not set');
  var tlbEmpty = document.getElementById('tlb-empty-btn');
  if (tlbEmpty) tlbEmpty.innerHTML = T('Empty Truck');

  // ── Auto-unload banner ──
  var aubTitle = document.querySelector('.aub-title');
  if (aubTitle) {
    var dot = aubTitle.querySelector('.aub-dot');
    var dotHtml = dot ? dot.outerHTML : '';
    aubTitle.innerHTML = dotHtml + '\n            ' + T('Unloading Detected');
  }
  document.querySelectorAll('.aub-lbl').forEach(function(lbl) {
    var txt = lbl.textContent.trim();
    if (txt === 'Before' || txt === 'Antes') lbl.textContent = T('Before');
    if (txt === 'Unloaded' || txt === 'Descargado') lbl.textContent = T('Unloaded');
    if (txt === 'Current' || txt === 'Actual') lbl.textContent = T('Current');
  });
  var irUnloadSub = document.getElementById('ir-unload-sub');
  if (irUnloadSub) irUnloadSub.textContent = T('Unloaded');
  var aubCancel = document.querySelector('.aub-cancel');
  if (aubCancel) aubCancel.textContent = T('Cancel');

  // ── Info rows ──
  var irField = document.getElementById('ir-field');
  if (irField && (irField.textContent === 'Select Field' || irField.textContent === 'No Field' || irField.textContent === 'Sin Campo' || irField.textContent === 'Seleccionar Campo')) irField.textContent = T('Select Field');
  var irFarm = document.getElementById('ir-farm');
  if (irFarm && (irFarm.textContent === 'No Farm' || irFarm.textContent === 'Sin Finca' || irFarm.textContent === 'Default' || irFarm.textContent === 'Predeterminado')) irFarm.textContent = T('No Farm');
  var irBuggy = document.getElementById('ir-buggy-title');
  if (irBuggy && (irBuggy.textContent === 'No Truck' || irBuggy.textContent === 'Sin Camión')) irBuggy.textContent = T('No Truck');
  var irCrop = document.getElementById('ir-crop-sub');
  if (irCrop && (irCrop.textContent === 'No Crop' || irCrop.textContent === 'Sin Cultivo')) irCrop.textContent = T('No Crop');
  var irUnload = document.getElementById('ir-unload');
  if (irUnload && (irUnload.textContent === 'Select Destination' || irUnload.textContent === 'Seleccionar Destino')) irUnload.textContent = T('Select Destination');
  var irWorker = document.getElementById('ir-worker');
  if (irWorker && (irWorker.textContent === 'No Operator Selected' || irWorker.textContent === 'Ningún Operador Seleccionado')) irWorker.textContent = T('No Operator Selected');
  var irBt = document.getElementById('ir-bt-status');
  if (irBt && (irBt.textContent === 'No Devices' || irBt.textContent === 'Sin Dispositivos')) irBt.textContent = T('No Devices');

  // ── Crop modal ──
  var cropModalTitle = document.querySelector('#crop-modal-overlay .crop-modal-title');
  if (cropModalTitle) cropModalTitle.textContent = T('Manage Crops');
  document.querySelectorAll('#crop-modal-overlay div').forEach(function(d) {
    if (d.textContent.trim() === 'Add New Crop' || d.textContent.trim() === 'Agregar Nuevo Cultivo')
      d.textContent = T('Add New Crop');
  });
  document.querySelectorAll('#crop-modal-overlay .crop-modal-btn').forEach(function(b) {
    if (b.textContent.trim() === 'Add Crop' || b.textContent.trim() === 'Agregar Cultivo') b.textContent = T('Add Crop');
  });
  document.querySelectorAll('#crop-modal-overlay .crop-modal-cancel').forEach(function(b) {
    if (b.textContent.trim() === 'Cancel' || b.textContent.trim() === 'Cancelar') b.textContent = T('Cancel');
  });
  document.querySelectorAll('#crop-modal-overlay span').forEach(function(s) {
    if (s.innerHTML.indexOf('lbs / bu') > -1 && s.innerHTML.indexOf('for yield calc') > -1)
      s.innerHTML = 'lbs / bu<br><span style="font-size:10px;">('+T('for yield calc')+')</span>';
  });
  // ── Field modal ──
  var fieldModalTitle = document.querySelector('#field-modal-overlay .crop-modal-title');
  if (fieldModalTitle) fieldModalTitle.textContent = T('Add New Field');
  var fieldModalHint = document.querySelector('#field-modal-farm-hint');
  if (fieldModalHint) {
    var farmSpan = document.getElementById('field-modal-farm-name');
    fieldModalHint.innerHTML = T('Adding to') + ': <span id="field-modal-farm-name">' + (farmSpan ? farmSpan.textContent : '—') + '</span>';
  }
  document.querySelectorAll('#field-modal-overlay .crop-modal-btn').forEach(function(b) {
    if (b.textContent.trim() === 'Add' || b.textContent.trim() === 'Agregar') b.textContent = T('Add');
  });
  document.querySelectorAll('#field-modal-overlay .crop-modal-cancel').forEach(function(b) {
    if (b.textContent.trim() === 'Cancel' || b.textContent.trim() === 'Cancelar') b.textContent = T('Cancel');
  });

  // ── Refresh crop dropdown with translated names ──
  if (typeof refreshCropDropdown === 'function') refreshCropDropdown();

  // ── Entry form ──
  document.querySelectorAll('.entry-form-panel label, .efp-row label').forEach(function(lbl) {
    var txt = lbl.textContent.trim();
    if (txt === 'Crop' || txt === 'Cultivo') lbl.textContent = T('Crop');
    if (txt === 'Moisture %' || txt === 'Humedad %') lbl.textContent = T('Moisture %');
    if (txt === 'Season' || txt === 'Temporada') lbl.textContent = T('Season');
  });
  var fSeason = document.getElementById('f-season-name');
  if (fSeason && (fSeason.textContent === 'No Season' || fSeason.textContent === 'Sin Temporada')) fSeason.textContent = T('No Season');

  // ── Fields tab ──
  document.querySelectorAll('#tp-fields .section-lbl').forEach(function(lbl) {
    var txt = lbl.textContent.trim();
    if (txt === 'Farms' || txt === 'Fincas') lbl.textContent = T('Farms');
    if (txt === 'Fields' || txt === 'Campos') lbl.textContent = T('Fields');
    if (txt === 'Farm' || txt === 'Finca') {} // skip — dynamic
  });

  // ── Trucks tab ──
  document.querySelectorAll('#tp-trucks .section-lbl').forEach(function(lbl) {
    if (lbl.textContent.trim() === 'Trucks' || lbl.textContent.trim() === 'Camiones') lbl.textContent = T('Trucks');
  });

  // ── Destinations tab ──
  document.querySelectorAll('#tp-destinations .section-lbl').forEach(function(lbl) {
    if (lbl.textContent.trim() === 'Destinations / Bins' || lbl.textContent.trim() === 'Destinos / Silos') lbl.textContent = T('Destinations / Bins');
  });

  // ── More panel ──
  document.querySelectorAll('.more-row-label').forEach(function(lbl) {
    var txt = lbl.textContent.trim();
    var map = {'Operators':'Operators','Operadores':'Operators','Season':'Season','Temporada':'Season',
      'Devices':'Devices','Dispositivos':'Devices','Settings':'Settings','Configuración':'Settings',
      'Cloud Sync':'Cloud Sync','Sincronización en la Nube':'Cloud Sync',
      'Field Map':'Field Map','Mapa de Campos':'Field Map','About':'About','Acerca de':'About'};
    var key = map[txt]; if (key) lbl.textContent = T(key);
  });
  var moreSection = document.querySelector('.more-section-lbl');
  if (moreSection) moreSection.textContent = T('More');

  // ── Connection mode ──
  var connModeLabel = document.querySelector('#tp-more [style*="font-size:14px;font-weight:700"]');
  if (connModeLabel && (connModeLabel.textContent === 'Connection Mode' || connModeLabel.textContent === 'Modo de Conexión'))
    connModeLabel.textContent = T('Connection Mode');
  // Mode buttons
  var modePrimary = document.getElementById('mode-btn-primary');
  if (modePrimary && (modePrimary.textContent === 'Primary' || modePrimary.textContent === 'Primario')) modePrimary.textContent = T('Primary');
  var modeRemote = document.getElementById('mode-btn-remote');
  if (modeRemote && (modeRemote.textContent === 'Remote' || modeRemote.textContent === 'Remoto')) modeRemote.textContent = T('Remote');
  var modeSub = document.getElementById('mode-sub-label');
  if (modeSub) {
    if (modeSub.textContent === 'Primary (BLE)' || modeSub.textContent === 'Primario (BLE)') modeSub.textContent = T('Primary (BLE)');
    if (modeSub.textContent === 'Remote (WiFi read-only)' || modeSub.textContent === 'Remoto (WiFi solo lectura)') modeSub.textContent = T('Remote (WiFi read-only)');
  }

  // ── Sub-panel back buttons ──
  document.querySelectorAll('.sp-back').forEach(function(btn) {
    if (btn.textContent.trim() === '‹ More' || btn.textContent.trim() === '‹ Más') btn.textContent = '‹ ' + T('More');
  });

  // ── Sub-panel headers ──
  document.querySelectorAll('.sp-title').forEach(function(el) {
    var txt = el.textContent.trim();
    var map = {'Devices':'Devices','Dispositivos':'Devices','Settings':'Settings','Configuración':'Settings',
      'Cloud Sync':'Cloud Sync','Sincronización en la Nube':'Cloud Sync',
      'Operators':'Operators','Operadores':'Operators','Season':'Season','Temporada':'Season',
      'About':'About','Acerca de':'About','Field Map':'Field Map','Mapa de Campos':'Field Map',
      'Transactions':'Transactions','Transacciones':'Transactions'};
    var key = map[txt]; if (key) el.textContent = T(key);
  });

  // ── Settings sub-panel ──
  document.querySelectorAll('#sp-settings .sp-section-lbl').forEach(function(lbl) {
    var txt = lbl.textContent.trim();
    if (txt === 'Units' || txt === 'Unidades') lbl.textContent = T('Units');
    if (txt === 'Language' || txt === 'Idioma') lbl.textContent = T('Language');
    if (txt === 'Auto-Unload Detection' || txt === 'Detección de Descarga Automática') lbl.textContent = T('Auto-Unload Detection');
    if (txt === 'Scale Power Saving' || txt === 'Ahorro de Batería de la Báscula') lbl.textContent = T('Scale Power Saving');
    if (txt === 'Data' || txt === 'Datos') lbl.textContent = T('Data');
  });
  document.querySelectorAll('#sp-settings .sr-label').forEach(function(lbl) {
    var txt = lbl.textContent.trim();
    var map = {'Weight':'Weight','Peso':'Weight','Temperature':'Temperature','Temperatura':'Temperature',
      'Area':'Area','Área':'Area',
      'Language':'Language','Idioma':'Language'};
    var key = map[txt]; if (key) lbl.textContent = T(key);
  });
  // Icon-having labels: translate via their dedicated id span so the ⓘ icon is untouched
  ['lbl-round','lbl-droptrigger','lbl-idletimeout','lbl-cleardata','lbl-clearcloud','lbl-darkmode'].forEach(function(id){
    var map = {'lbl-round':'Display Rounding','lbl-droptrigger':'Drop Trigger','lbl-idletimeout':'Idle Timeout','lbl-cleardata':'Clear Local Transactions','lbl-clearcloud':'Clear Cloud Data','lbl-darkmode':'Dark Mode'};
    var el = document.getElementById(id); if (el) el.textContent = T(map[id]);
  });
  var lta=document.getElementById('lbl-theme-auto'); if(lta) lta.textContent=T('Auto');
  var ltl=document.getElementById('lbl-theme-light'); if(ltl) ltl.textContent=T('Light');
  var ltd=document.getElementById('lbl-theme-dark'); if(ltd) ltd.textContent=T('Dark');
  document.querySelectorAll('#seg-powersave .seg-btn').forEach(function(b){
    var txt = b.textContent.trim();
    var map = {'Off':'Off','Apagado':'Off','30 min':'30 min','1 hr':'1 hr','1 h':'1 hr','2 hr':'2 hr','2 h':'2 hr'};
    var key = map[txt]; if (key) b.textContent = T(key);
  });
  document.querySelectorAll('#sp-settings .sr-sub').forEach(function(sub) {
    var txt = sub.textContent.trim();
    var map = {'Scale display unit':'Scale display unit','Unidad de visualización':'Scale display unit',
      'Weather & conditions':'Weather & conditions','Clima y condiciones':'Weather & conditions',
      'Field measurements':'Field measurements','Mediciones de campo':'Field measurements',
      'Wipe logs from this device':'Wipe logs from this device','Borrar registros de este dispositivo':'Wipe logs from this device',
      'App language':'App language','Idioma de la aplicación':'App language'};
    var key = map[txt]; if (key) sub.textContent = T(key);
  });

  // ── Devices sub-panel ──
  // These are driven by data-en rather than by matching the rendered text.
  // Matching text can only ever work one way: the guards here used to look for
  // 'Carritos de Grano' / '＋ Agregar Carrito' / 'Nombre del Carrito *', but the
  // dictionary actually renders 'Tolvas' / 'Agregar Tolva' / 'Nombre de la Tolva',
  // so once switched to Spanish nothing matched and English never came back.
  // Keying off the original English makes the sweep idempotent and immune to
  // any later change of wording.
  document.querySelectorAll('[data-en]').forEach(function(el) {
    var pre = el.getAttribute('data-en-prefix') || '';
    var suf = el.getAttribute('data-en-suffix') || '';
    el.textContent = pre + T(el.getAttribute('data-en')) + suf;
  });
  // Placeholders are not textContent, so they need their own sweep. Same
  // idempotent rule: the attribute holds the English, never the rendered text.
  document.querySelectorAll('[data-en-ph]').forEach(function(el) {
    el.placeholder = T(el.getAttribute('data-en-ph'));
  });
  var _scanBtn   = document.getElementById('btn-scan');
  var _scanGroup = _scanBtn && _scanBtn.closest('.tx-field-group');
  var acScaleLbl = _scanGroup && _scanGroup.querySelector('label');
  if (acScaleLbl && (acScaleLbl.textContent.trim()==='Scale'||acScaleLbl.textContent.trim()==='Báscula'))
    acScaleLbl.textContent = T('Scale');
  var _dfuSubEl  = document.getElementById('dfu-sub');
  var _dfuRow    = _dfuSubEl && _dfuSubEl.closest('.setting-row');
  var fwCheckRow = _dfuRow && _dfuRow.querySelector('.sr-label');
  if (fwCheckRow && (fwCheckRow.textContent.trim()==='Check for Firmware Updates'||fwCheckRow.textContent.trim()==='Buscar Actualizaciones de Firmware'))
    fwCheckRow.textContent = T('Check for Firmware Updates');
  var dfuSub = document.getElementById('dfu-sub');
  if (dfuSub && (dfuSub.textContent.trim()==='Tap to check for the latest version'||dfuSub.textContent.trim()==='Toca para buscar la última versión'))
    dfuSub.textContent = T('Tap to check for the latest version');

  // ── Sleep overlay / Unrecognized-scale block ──
  var stt = document.getElementById('sleep-title-txt'); if (stt) stt.textContent = T('Scale in Sleep Mode');
  var sst = document.getElementById('sleep-sub-txt'); if (sst) sst.textContent = T('The scale is conserving battery after a period of inactivity. Tap Wake to resume weighing.');
  var swb = document.getElementById('sleep-wake-btn'); if (swb) swb.textContent = T('Wake');
  var abt = document.getElementById('authblock-title'); if (abt) abt.textContent = T('Unrecognized Scale');
  var abs = document.getElementById('authblock-sub'); if (abs) abs.textContent = T('This scale could not be verified as genuine Virtus hardware. For your data\'s integrity, the app works only with authentic Virtus scales.');
  var abb = document.getElementById('authblock-btn'); if (abb) abb.textContent = T('Disconnect');
  var scanLbl = document.getElementById('scan-label');
  if (scanLbl && (scanLbl.textContent === 'Scan for Devices' || scanLbl.textContent === 'Buscar Dispositivos'))
    scanLbl.textContent = T('Scan for Devices');
  document.querySelectorAll('#sp-devices .sp-section-lbl').forEach(function(lbl) {
    var txt = lbl.textContent.trim();
    if (txt === 'Weight Device' || txt === 'Dispositivo de Peso') lbl.textContent = T('Weight Device');
    if (txt === 'Calibration' || txt === 'Calibración') lbl.textContent = T('Calibration');
    if (txt === 'Diagnostics Terminal' || txt === 'Terminal de Diagnóstico') lbl.textContent = T('Diagnostics Terminal');
  });
  document.querySelectorAll('#sp-devices .sr-label').forEach(function(lbl) {
    // Strip the ⓘ / ⚙️ affordances before matching. Labels that carry an info
    // icon (Zero Scale, Sensitivity, Rated Capacity) have it inside the element,
    // so textContent was "Zero Scale ⓘ" and never matched the map — those three
    // silently stayed in English regardless of the selected language.
    var txt = lbl.textContent.replace(/[⚙️ⓘ]/g,'').replace(/\s+/g,' ').trim();
    var map = {'Model':'Model','Modelo':'Model','Serial Number':'Serial Number','Número de Serie':'Serial Number',
      'Firmware Version':'Firmware Version','Versión de Firmware':'Firmware Version',
      'Battery':'Battery','Batería':'Battery','Input Voltage':'Input Voltage','Voltaje de Entrada':'Input Voltage',
      'Sensitivity':'Sensitivity','Sensibilidad':'Sensitivity',
      'Rated Capacity':'Rated Capacity','Capacidad Nominal':'Rated Capacity',
      'Calibration Tool':'Calibration Tool','Herramienta de Calibración':'Calibration Tool',
      'Firmware Updates':'Firmware Updates','Actualizaciones de Firmware':'Firmware Updates',
      'Zero Scale':'Zero Scale','Tarar Báscula':'Zero Scale','Cero de Báscula':'Zero Scale',
      'Send Report To':'Send Report To','Enviar Informe a':'Send Report To'};
    var key = map[txt]; if (!key) return;
    // Move the existing icon node aside and re-attach it, rather than rebuilding
    // it from HTML — this keeps its onclick handlers intact and stops the
    // translation pass from wiping the ⓘ / battery indicator off the label.
    // Scope the lookup to THIS label. The fallback used to be a global
    // getElementById('dev-battery-icon'), so any label without its own ⓘ — the
    // Calibration Tool row, for one — picked up the battery indicator and the
    // re-attach below physically moved it, which is how "Good" ended up next to
    // Calibration Tool instead of Battery.
    var icon = lbl.querySelector('.info-ico, #dev-battery-icon');
    lbl.textContent = T(key);
    if (icon) {
      lbl.appendChild(document.createTextNode(' '));
      lbl.appendChild(icon);
    }
  });
  // Devices buttons
  var btnZero = document.getElementById('btn-zero');
  if (btnZero && (btnZero.textContent === 'Zero' || btnZero.textContent === 'Cero')) btnZero.textContent = T('Zero');
  var btnCheck = document.getElementById('btn-ota-check');
  if (btnCheck && (btnCheck.textContent === 'Check' || btnCheck.textContent === 'Verificar')) btnCheck.textContent = T('Check');
  // Devices sub labels
  document.querySelectorAll('#sp-devices .sr-sub').forEach(function(sub) {
    var txt = sub.textContent.trim();
    if (txt === 'Check via scale WiFi connection' || txt === 'Verificar vía conexión WiFi de la báscula') sub.textContent = T('Check via scale WiFi connection');
    if (txt === 'Permanently re-zeros the scale' || txt === 'Pone la báscula a cero permanentemente') sub.textContent = T('Permanently re-zeros the scale');
  });

  // ── Cloud sub-panel ──
  document.querySelectorAll('#sp-cloud .sr-label').forEach(function(lbl) {
    var txt = lbl.textContent.trim();
    var map = {'Pending Records':'Pending Records','Registros Pendientes':'Pending Records',
      'Last Synced':'Last Synced','Última Sincronización':'Last Synced',
      'Connection':'Connection','Conexión':'Connection'};
    var key = map[txt]; if (key) lbl.textContent = T(key);
  });

  // ── Operators sub-panel ──
  document.querySelectorAll('#sp-operators .sp-section-lbl').forEach(function(lbl) {
    var txt = lbl.textContent.trim();
    if (txt === 'Active Operator' || txt === 'Operador Activo') lbl.textContent = T('Active Operator');
    if (txt === 'Operators' || txt === 'Operadores') lbl.textContent = T('Operators');
  });
  var opNameLbl = document.getElementById('op-name-label');
  if (opNameLbl) opNameLbl.textContent = T('Name *');
  var opName = document.getElementById('op-name');
  if (opName && (opName.textContent === 'No Operator Selected' || opName.textContent === 'Ning��n Operador Seleccionado'))
    opName.textContent = T('No Operator Selected');
  var opRole = document.getElementById('op-role');
  if (opRole && (opRole.textContent === 'Tap an operator below to select' || opRole.textContent === 'Toca un operador abajo para seleccionar'))
    opRole.textContent = T('Tap an operator below to select');

  // ── Season sub-panel ──
  var seasonActiveName = document.getElementById('season-active-name');
  if (seasonActiveName && (seasonActiveName.textContent === 'No Season Selected' || seasonActiveName.textContent === 'Sin Temporada Seleccionada'))
    seasonActiveName.textContent = T('No Season Selected');

  // ── About sub-panel ──
  document.querySelectorAll('#sp-about .sr-label').forEach(function(lbl) {
    var txt = lbl.textContent.trim();
    if (txt === 'Version' || txt === 'Versión') lbl.textContent = T('Version');
    if (txt === 'Platform' || txt === 'Plataforma') lbl.textContent = T('Platform');
  });
  var abPlatSweep = document.getElementById('about-platform');
  if (abPlatSweep && abPlatSweep.textContent.trim()) abPlatSweep.textContent = getRuntimePlatformLabel();

  // ── Field map ──
  var fmBtns = {
    'fmap-btn-all':'All Fields','fmap-btn-farm':'Current Field',
    'fmap-btn-locate':'My Location','fmap-btn-draw':'Draw Boundary'
  };
  Object.keys(fmBtns).forEach(function(id) {
    var el = document.getElementById(id); if (el) el.textContent = T(fmBtns[id]);
  });
  var fmEmpty = document.getElementById('fmap-empty');
  if (fmEmpty) fmEmpty.textContent = T('No GPS data found for any field or transaction yet.');
  var fmPts = document.getElementById('fmap-draw-pts');
  if (fmPts && (fmPts.textContent === '0 points' || fmPts.textContent === '0 puntos'))
    fmPts.textContent = T('0 points');
  // Detail-panel back buttons and the two edit-sheet titles — static markup.
  var backBtns = {'fdp-back-fields':'Fields','fdp-back-trucks':'Trucks',
                  'fdp-back-dests':'Destinations','fdp-back-farms':'Farms'};
  Object.keys(backBtns).forEach(function(id){
    var el = document.getElementById(id); if (el) el.textContent = '‹ '+T(backBtns[id]);
  });
  var editTitles = {'farm-edit-title':'Edit Farm','dest-edit-title':'Edit Destination'};
  Object.keys(editTitles).forEach(function(id){
    var el = document.getElementById(id); if (el) el.textContent = T(editTitles[id]);
  });
  // Draw bar buttons — static markup, so they need the sweep like the toolbar above.
  var fmDraw = {'fmap-draw-undo':'Undo','fmap-draw-save':'Save','fmap-draw-cancel':'Cancel',
                'fmap-edit-save':'Save','fmap-edit-cancel':'Cancel',
                'fmap-edit-label':'Drag the points to adjust'};
  Object.keys(fmDraw).forEach(function(id){
    var el = document.getElementById(id); if (el) el.textContent = T(fmDraw[id]);
  });
  var fmSel = document.getElementById('fmap-draw-field-sel');
  if (fmSel && fmSel.options.length && fmSel.options[0].value === '')
    fmSel.options[0].textContent = '— '+T('Select field')+' —';

  // ── Modal/sheet titles ──
  var sheetTitles = {
    'unload-sheet': '.sheet-title',
    'crop-modal-overlay': '.crop-modal-title',
    'field-modal-overlay': '.crop-modal-title',
  };
  var titleMap = {
    'Select Unload Location':'Select Unload Location','Seleccionar Ubicación de Descarga':'Select Unload Location',
    'Add New Field':'Add New Field','Agregar Nuevo Campo':'Add New Field',
    'Manage Crops':'Manage Crops','Gestionar Cultivos':'Manage Crops',
  };
  Object.keys(sheetTitles).forEach(function(id) {
    var parent = document.getElementById(id);
    if (parent) {
      var titleEl = parent.querySelector(sheetTitles[id]);
      if (titleEl) { var key = titleMap[titleEl.textContent.trim()]; if (key) titleEl.textContent = T(key); }
    }
  });

  // ── TX sheet labels ──
  document.querySelectorAll('#tx-sheet-overlay .tx-field-group label').forEach(function(lbl) {
    // Skip weight label — has unit span inside, handled separately below
    if(lbl.querySelector('#tx-weight-unit')) return;
    var txt = lbl.textContent.trim();
    var clean = txt.replace(/\s*\(.*\)\s*$/,'').replace(/\s*\*\s*$/,'');
    var map = {'Weight':'Weight *','Peso':'Weight *','Crop':'Crop *','Cultivo':'Crop *',
      'Truck':'Truck','Camión':'Truck','Destination':'Destination','Destino':'Destination',
      'Field':'Field','Campo':'Field','Operator':'Operator','Operador':'Operator',
      'Moisture %':'Moisture %','Humedad %':'Moisture %',
      'Dry Weight':'Dry Weight','Peso Seco':'Dry Weight',
      'Notes':'Notes','Notas':'Notes'};
    var key = map[clean]; if (key) lbl.textContent = T(key);
  });
  // Weight label — preserve unit span inside it
  var _txWUSpan = document.getElementById('tx-weight-unit');
  if(_txWUSpan){ var _txU = _txWUSpan.textContent; _txWUSpan.parentNode.innerHTML = T('Weight *')+' (<span id="tx-weight-unit">'+_txU+'</span>)'; }

  // ── Add truck sheet labels ──
  document.querySelectorAll('#add-truck-sheet-overlay .tx-field-group label').forEach(function(lbl) {
    var txt = lbl.textContent.trim().replace(/\s*\*\s*$/,'');
    var map = {'Truck Name':'Truck Name *','Nombre del Camión':'Truck Name *',
      'Licence Plate':'Licence Plate *','Matrícula':'Licence Plate *',
      'Driver Name':'Driver Name','Nombre del Conductor':'Driver Name',
      'Capacity (kg)':'Capacity (kg)','Capacidad (kg)':'Capacity (kg)',
      'Make / Model':'Make / Model','Marca / Modelo':'Make / Model',
      'Notes':'Notes','Notas':'Notes'};
    var key = map[txt]; if (key) lbl.textContent = T(key);
  });

  // ── Edit Field sheet ──
  // Its Cancel/Save buttons were already covered by the generic .tx-btn-* sweep
  // below, which is why only the title and labels stayed English.
  var fesT = document.getElementById('fes-title');      if (fesT) fesT.textContent = T('Edit Field');
  var fesN = document.getElementById('fes-name-lbl');   if (fesN) fesN.textContent = T('Field Name');
  var fesA = document.getElementById('fes-area-lbl');   if (fesA) fesA.textContent = T('Area');
  var fesC = document.getElementById('fes-crop-lbl');   if (fesC) fesC.textContent = T('Primary Crop');
  var fesO = document.getElementById('fes-crop-opt');   if (fesO) fesO.textContent = '('+T('optional')+')';
  var fesNo= document.getElementById('fes-notes-lbl');  if (fesNo) fesNo.textContent = T('Notes');
  var fesCn= document.getElementById('fes-crop-none');  if (fesCn) fesCn.textContent = T('No crop assigned');

  // State-driven labels: these aren't static text, so the data-en pass can't
  // own them. Re-derive from the stored state on every language switch.
  var battIcon = document.getElementById('dev-battery-icon');
  if (battIcon && battIcon.dataset.batteryPct !== undefined && typeof _updateBatteryIndicator === 'function')
    _updateBatteryIndicator(Number(battIcon.dataset.batteryPct));
  var fwBtn = document.getElementById('btn-fw-check');
  if (fwBtn && typeof _setFwButtonMode === 'function') _setFwButtonMode(fwBtn.dataset.mode || 'check');

  // ── Various save/cancel buttons ──
  document.querySelectorAll('.tx-btn-save').forEach(function(btn) {
    var txt = btn.textContent.trim();
    var map = {'Save Transaction':'Save Transaction','Guardar Transacción':'Save Transaction',
      'Save Truck':'Save Truck','Guardar Cami��n':'Save Truck',
      'Save Field':'Save Field','Guardar Campo':'Save Field',
      'Save Settings':'Save Settings','Guardar Configuración':'Save Settings',
      'Save':'Save','Guardar':'Save','Add':'Add','Agregar':'Add'};
    var key = map[txt]; if (key) btn.textContent = T(key);
  });
  document.querySelectorAll('.tx-btn-cancel').forEach(function(btn) {
    var txt = btn.textContent.trim();
    if (txt === 'Cancel' || txt === 'Cancelar') btn.textContent = T('Cancel');
    if (txt === 'Run Diagnostics' || txt === 'Ejecutar Diagnóstico') btn.textContent = T('Run Diagnostics');
  });
  var sendEmailBtn = document.getElementById('diag-send-email-btn');
  if (sendEmailBtn) sendEmailBtn.textContent = T('Send Email');
  var clearLogBtn = document.getElementById('diag-clear-log-btn');
  if (clearLogBtn) clearLogBtn.textContent = T('Clear Event Log');
  var diagStatus = document.getElementById('diag-status');
  if (diagStatus) {
    var dsTxt = diagStatus.textContent.trim();
    if (dsTxt === 'Run diagnostics first, then send via your email app' || dsTxt === 'Ejecuta el diagnóstico primero, luego envía por correo')
      diagStatus.textContent = T('Run diagnostics first, then send via your email app');
    else if (dsTxt === 'Report ready — tap Send Email to dispatch' || dsTxt === 'Informe listo — toca Enviar Correo para enviarlo')
      diagStatus.textContent = T('Report ready — tap Send Email to dispatch');
  }

  // ── Geofence dialog ──
  var geoTitle = document.querySelector('.geofence-title');
  if (geoTitle) geoTitle.textContent = T("You've entered a field");
  var geoCancel = document.querySelector('.geofence-cancel');
  if (geoCancel) geoCancel.textContent = T('Stay');
  var geoConfirm = document.querySelector('.geofence-confirm');
  if (geoConfirm) geoConfirm.textContent = T('Switch Field');

  // ── Login prompt ──
  var lpTitle = document.getElementById('lp-title');
  if (lpTitle) lpTitle.textContent = T('Sign in to sync your data');
  var lpSub = document.getElementById('lp-sub');
  if (lpSub) lpSub.textContent = T('Save to cloud & access all features');

  // ── Profile photo sheet ──
  var ppTitle = document.querySelector('#profile-pic-overlay [style*="font-size:16px"]');
  if (ppTitle) ppTitle.textContent = T('Profile Photo');

  // ── Wheel picker ──
  var wheelCustom = document.getElementById('wheel-custom-btn');
  if (wheelCustom) wheelCustom.textContent = T('Custom');
  var wheelDone = document.querySelector('.wheel-confirm-btn');
  if (wheelDone) wheelDone.textContent = T('Done');

  // ── Fields tab — buttons & stats ──
  // "+ Farm" button
  var farmViewBtns = document.querySelectorAll('button[onclick*="openAddNameSheet(\'farm\')"]');
  farmViewBtns.forEach(function(b) { b.textContent = T('+ Farm'); });
  // "+ Field" button
  var fieldViewBtns = document.querySelectorAll('button[onclick*="openAddNameSheet(\'field\')"]');
  fieldViewBtns.forEach(function(b) { b.textContent = T('+ Field'); });
  // "Add" confirm buttons
  document.querySelectorAll('.btn-add-confirm').forEach(function(b) {
    if (b.textContent.trim() === 'Add' || b.textContent.trim() === 'Agregar') b.textContent = T('Add');
  });
  // Farm stats labels
  var statLabels = document.querySelectorAll('#farm-stats-card div[style*="text-transform:uppercase"]');
  statLabels.forEach(function(lbl) {
    var txt = lbl.textContent.trim();
    if (txt === 'Total Harvested' || txt === 'TOTAL HARVESTED' || txt === 'Total Cosechado' || txt === 'TOTAL COSECHADO')
      lbl.textContent = T('Total Harvested');
    if (txt === 'Total Area' || txt === 'TOTAL AREA' || txt === 'Área Total' || txt === 'ÁREA TOTAL')
      lbl.textContent = T('Total Area');
  });

  // ── Trucks tab — "+ Truck" button ──
  var truckBtn = document.querySelector('#tp-trucks button[onclick*="openAddTruckSheet"]');
  if (truckBtn) truckBtn.textContent = T('+ Truck');
  // ── Destinations tab — "+ Destination" button ──
  var destBtn = document.querySelector('#tp-destinations button[onclick*="openAddNameSheet"]');
  if (destBtn) destBtn.textContent = T('+ Destination');
  // ── Operators sub-panel — "+ Operator" button ──
  var opBtn = document.querySelector('#sp-operators button[onclick*="openAddOperatorSheet"]');
  if (opBtn) opBtn.textContent = T('+ Operator');
  // ── Season sub-panel — "+ Season" button ──
  var seasonBtn = document.querySelector('#sp-season button[onclick*="openAddSeasonSheet"]');
  if (seasonBtn) seasonBtn.textContent = T('+ Season');
  // ── Active Season label ──
  var asLbl = document.querySelector('#season-list-view [style*="text-transform:uppercase"]');
  if (asLbl && (asLbl.textContent.trim() === 'Active Season' || asLbl.textContent.trim() === 'ACTIVE SEASON'
    || asLbl.textContent.trim() === 'Temporada Activa' || asLbl.textContent.trim() === 'TEMPORADA ACTIVA'))
    asLbl.textContent = T('Active Season');

  // ── Auth screen (s-login) ──
  var stSi2 = document.getElementById('stab-signin'); if (stSi2) stSi2.textContent = T('Sign In');
  var stSu2 = document.getElementById('stab-signup'); if (stSu2) stSu2.textContent = T('Create Account');
  document.querySelectorAll('#s-login .signin-field label').forEach(function(lbl) {
    var txt = lbl.textContent.trim();
    if (txt === 'Email Address' || txt === 'Correo Electrónico') lbl.textContent = T('Email Address');
    if (txt === 'Password' || txt === 'Contraseña') lbl.textContent = T('Password');
    if (txt === 'Full Name' || txt === 'Nombre Completo') lbl.textContent = T('Full Name');
    if (txt === 'New Password' || txt === 'Nueva Contraseña') lbl.textContent = T('New Password');
    if (txt === 'Confirm Password' || txt === 'Confirmar Contraseña') lbl.textContent = T('Confirm Password');
  });
  var siBtn2 = document.getElementById('signin-btn'); if (siBtn2 && !siBtn2.disabled) siBtn2.textContent = T('Sign In');
  var suBtn2 = document.getElementById('signup-btn'); if (suBtn2) suBtn2.textContent = T('Create Account');
  var fgBtn2 = document.getElementById('forgot-btn'); if (fgBtn2) fgBtn2.textContent = T('Send Reset Link');
  var rsBtn2 = document.getElementById('reset-btn'); if (rsBtn2 && !rsBtn2.disabled) rsBtn2.textContent = T('Set New Password');
  var fgLnk = document.querySelector('#signin-form .signin-forgot'); if (fgLnk) fgLnk.textContent = T('Forgot password?');
  var bkLnk = document.querySelector('#forgot-form .signin-forgot'); if (bkLnk) bkLnk.textContent = T('← Back to Sign In');
  // Forgot form description
  var fgDesc = document.querySelector('#forgot-form > div[style*="font-size:14px"]');
  if (fgDesc) fgDesc.textContent = T("Enter your email address and we'll send you a link to reset your password.");
  // Reset form description
  var rsDesc = document.querySelector('#reset-form > div[style*="font-size:14px"]');
  if (rsDesc) rsDesc.textContent = T('Enter your new password below.');
  // Auth placeholders
  var siEmail = document.getElementById('signin-email'); if (siEmail) siEmail.placeholder = 'you@example.com';
  var siPw = document.getElementById('signin-password'); if (siPw) siPw.placeholder = T('Your password');
  var suName = document.getElementById('signup-name'); if (suName) suName.placeholder = '';
  var suPw = document.getElementById('signup-password'); if (suPw) suPw.placeholder = T('Min. 8 characters');
  var rsPw = document.getElementById('reset-password'); if (rsPw) rsPw.placeholder = T('Min. 8 characters');
  var rsCf = document.getElementById('reset-confirm'); if (rsCf) rsCf.placeholder = T('Repeat password');

  // ── In-app signin sheet ──
  var iasTitle = document.querySelector('#in-app-signin-overlay [style*="font-size:17px"]');
  if (iasTitle) iasTitle.textContent = T('Sign In');
  var iasEmailLbl = document.querySelector('#in-app-signin-overlay label[style*="font-size:12px"]');
  if (iasEmailLbl) iasEmailLbl.textContent = T('Email Address');
  // Password label in in-app signin
  var iasLabels = document.querySelectorAll('#in-app-signin-overlay label');
  iasLabels.forEach(function(lbl) {
    var txt = lbl.textContent.trim();
    if (txt === 'Email' || txt === 'Correo Electrónico') lbl.textContent = T('Email Address');
    if (txt === 'Password' || txt === 'Contraseña') lbl.textContent = T('Password');
  });
  var iasBtn = document.getElementById('ias-btn'); if (iasBtn && !iasBtn.disabled) iasBtn.textContent = T('Sign In');
  var iasCrt = document.querySelector('#in-app-signin-overlay button[onclick*="openCreateAccountSheet"]');
  if (iasCrt) iasCrt.textContent = T('Create Account');
  var iasForgot = document.getElementById('ias-forgot'); if (iasForgot) iasForgot.textContent = T('Forgot password? Reset password');

  // ── Login prompt overlay ──
  var lpTitle2 = document.getElementById('lp-title');
  if (lpTitle2) lpTitle2.textContent = T('Sign in to sync your data');
  var lpSub2 = document.getElementById('lp-sub');
  if (lpSub2) lpSub2.textContent = T('Save to cloud & access all features');
  var lpSkip = document.getElementById('lp-skip-btn');
  if (lpSkip) lpSkip.textContent = T('Skip');
  var lpSignIn = document.querySelector('#login-prompt-overlay button[onclick*="goToSignIn"]');
  if (lpSignIn) lpSignIn.textContent = T('Sign In / Sign Up');

  // ── Password reset overlay ──
  var prTitle = document.querySelector('#pwd-reset-overlay [style*="font-size:20px"]');
  if (prTitle) prTitle.textContent = T('Reset Password');
  var prBtn = document.getElementById('app-reset-btn');
  if (prBtn) prBtn.textContent = T('Set New Password');
}


