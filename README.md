# Harry Potter Saga — Fuente VOD (lolapp)

Adaptación del plugin Kino de la saga Harry Potter.

## Datos

JSON remoto:  
https://raw.githubusercontent.com/YxhelZvl/kino-datasource/refs/heads/main/harry_potter.json

IDs TMDB: 671, 672, 673, 674, 675, 767, 12444, 12445.

## Limitación importante

Las URLs vienen **cifradas** (`YxhelZvl::…`) con **AES-256-GCM**.  
En Kino la clave sale de `kino.secret('hpKey')`. Esa clave **no está en el código público**.

Sin `HP_KEY` en `index.js`, el addon **no puede reproducir** (solo lista/catálogo si se usa `getHome`).

Si tienes la clave (hex 64 caracteres), edita en `index.js`:

```js
var HP_KEY = 'tu_clave_hex_aqui';
```

Y asegúrate de tener un decrypt AES-GCM disponible (en flutter_js el crypto-js embebido no suele traer GCM).

## Instalación

1. Repo GitHub: `usuario/harry-potter-addon`
2. lolapp → **Addons / Fuentes → Comunidad** → instalar
3. Activar **Harry Potter Saga**
4. Abrir una película de la saga (mismo TMDB id)

## Estructura

```
harry-potter-addon/
├── manifest.json
├── index.js
├── logo.png
└── README.md
```
