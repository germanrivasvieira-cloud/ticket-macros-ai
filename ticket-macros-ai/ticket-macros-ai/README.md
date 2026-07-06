# Ticket Macros AI

App móvil estilo ticket/recibo para registrar calorías y macros diarios con IA, búsqueda web nutricional y análisis de foto.

## Instalación

```bash
npm install
cp .env.example .env
npm start
```

Abre `http://localhost:3000` en el móvil o navegador.

## Dónde poner la API key

En el archivo `.env`:

```bash
OPENAI_API_KEY=tu_clave_real
```

El backend usa la API de OpenAI desde `server.js`. No pongas la clave en `public/app.js`, porque sería visible en el navegador.

## Notas

- Los datos diarios se guardan en `localStorage` del dispositivo.
- La IA devuelve JSON limpio al frontend.
- El usuario puede editar nombre, gramos, kcal, proteínas, carbohidratos y grasas.
- La búsqueda nutricional se fuerza desde el prompt y las herramientas web del modelo.
