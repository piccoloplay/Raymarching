# CSG Raymarcher

Renderer real-time in **WebGL 2** che disegna scene **CSG** con il **ray marching**: la scena non è una mesh di triangoli, ma una **funzione di distanza con segno** (SDF) valutata per ogni pixel. I modelli arrivano da **OpenSCAD** come file `.csg`.

## Demo video

[![Guarda la demo su YouTube](https://img.youtube.com/vi/PpxKhARw3Kw/hqdefault.jpg)](https://youtu.be/PpxKhARw3Kw)

*(clicca l'immagine per aprire il video)*

**Demo online:** `https://<utente>.github.io/<repo>/` *(sostituisci con l'URL della tua GitHub Pages)*

## Come funziona

- La geometria non è memorizzata come dati, ma come una **SDF**: una funzione che, dato un punto dello spazio, restituisce la distanza dalla superficie più vicina.
- L'immagine si ottiene con lo **sphere tracing**: da ogni pixel parte un raggio che avanza della distanza restituita dalla SDF, fino a toccare la superficie.
- Le operazioni **CSG** (unione, intersezione, differenza) sono semplici `min`/`max` sulle distanze.
- I modelli `.csg` esportati da OpenSCAD vengono letti da un parser che ne costruisce l'albero CSG; un **generatore di codice** emette per ogni scena il fragment shader in **GLSL ES 3.00**, con l'albero espanso in codice lineare (`map()` generato per scena).
- Dalla stessa SDF derivano anche **ombre morbide**, **ambient occlusion** e **normali** (gradiente per differenze finite).

## Comandi

| Azione | Comando |
|---|---|
| Ruota la camera | trascina con il mouse |
| Zoom | rotella |
| Cambia scena | menu **scena** in alto |
| Importa un modello | pulsante **+ carica .csg…** oppure trascina un file `.csg` sulla finestra |

**Cubo di prova** (checkbox *cubo test*): si fonde (smooth-union) con il modello per mostrare che la scena è una funzione unica.

| Azione | Tasto |
|---|---|
| Sposta sul piano | frecce |
| Sposta in altezza (Z) | PgUp / PgDn |
| Dimensione | `+` / `-` |
| Reset | `R` |

## Struttura del progetto

```
05-csg-raymarcher/
├── index.html                pagina + HUD (menu scene, drag-drop di .csg)
├── js/
│   ├── main.js               render loop, gestione scene, cubo di prova
│   ├── csg-parser.js         legge un .csg di OpenSCAD e ne costruisce l'albero CSG
│   ├── csg-codegen.js        traduce l'albero in GLSL (primitive + albero espanso)
│   ├── csg-autoload.js       carica i .csg inclusi come scene di partenza
│   ├── webgl-utils.js        compila e linka gli shader, prepara il triangolo full-screen
│   └── camera.js             camera orbitale
├── shaders/
│   ├── csg.vert.js           vertex shader: triangolo a schermo intero
│   └── csg.frag.template.js  fragment shader: sphere tracing, normali, ombre, AO
├── scenes/
│   ├── registry.js           registry globale delle scene + helper CSG
│   └── test_*.js             scene di esempio
└── csg/                      modelli .csg esportati da OpenSCAD
```

## Esecuzione in locale

Il progetto è interamente lato client, ma va servito da un **server HTTP statico** (l'autoload dei `.csg` usa `fetch`, bloccato aprendo `index.html` con `file://`). Per esempio:

```bash
python -m http.server 8000
# poi apri http://localhost:8000
```

Su **GitHub Pages** funziona senza configurazione.

## Requisiti

Un browser con supporto **WebGL 2** (Chrome, Firefox, Edge recenti).

## Contesto

Progetto per l'esame di **Computer Graphics** (UNIFI). Il ray marching e le SDF seguono i riferimenti classici di Jamie Wong e Inigo Quilez; i modelli sono costruiti in OpenSCAD con sole primitive e operazioni booleane.
