# Control de recepción — Incremento 1

Origen: `Incremento 1-20261004T220901Z-1-001.zip`. Fecha: 4 de octubre de 2026.

Se recibieron 97 archivos: 91 se incorporaron al repositorio, 2 videos se distribuyen en Releases y 4 archivos se omitieron. El inventario registra la ruta original, destino y SHA-256 de cada copia; las copias adaptadas incluyen sus dos hashes.

Los respaldos temporales .bkp se omitieron. Los nombres se normalizaron para evitar caracteres dañados y espacios finales recibidos del ZIP. Se comprobaron paquetes Word, Excel, PowerPoint y Workbench como ZIP íntegros; los diagramas .drawio como XML. Esta revisión de formato no certifica el contenido académico ni el funcionamiento histórico.

## Ajustes de publicación

- Codigo/server.js: Credenciales MySQL y SMTP retiradas; configuracion mediante .env. No se cambiaron las reglas del incremento.

El archivo BD_completa.sql contiene registros y no se publica; el esquema sin datos bd_codigo.sql está en Base-de-datos/. Las credenciales originales del servidor se sustituyeron por variables de entorno; Node.js 22.12 o posterior carga Codigo/.env si existe. No hay credenciales predeterminadas en la copia publicada.

## Videos recibidos

- Presentacion-Incremento-I-Semestre-2.mp4: 340383895 bytes; SHA-256 ffbe1b4fc10fb5a708ba0f47845fac0140905fb6837cc626e643c5376240c05a
- Presentacion-Incremento-I-Semestre-1.mp4: 252900015 bytes; SHA-256 c8498be2b7ee25b0f0ba122096041e72777360a858fc8e18e8c35e57919a2db9

Los videos se conservan completos. Las evidencias son las enviadas por el equipo y no se alteraron sus resultados. No se recrearon documentos ausentes ni se reemplazó el código histórico por el Incremento 3.
