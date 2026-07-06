import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import OpenAI from '@openai/openai';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const port = process.env.PORT || 3000;
const model = process.env.OPENAI_MODEL || 'gpt-5.1-mini';

if (!process.env.OPENAI_API_KEY) {
  console.warn('Falta OPENAI_API_KEY en .env');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const foodSchema = {
  name: 'nutrition_foods',
  schema: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        brand: { type: 'string' },
        grams: { type: 'number' },
        kcal: { type: 'number' },
        protein: { type: 'number' },
        carbs: { type: 'number' },
        fat: { type: 'number' },
        source: { type: 'string' },
        confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
        fromPhoto: { type: 'boolean' }
      },
      required: ['name', 'brand', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'source', 'confidence', 'fromPhoto']
    }
  }
};

function systemPrompt(mode) {
  return `Eres un asistente nutricional para una app personal española de registro diario. Responde SOLO JSON válido, sin markdown ni explicaciones.

Formato obligatorio:
[ { "name": "Copos de avena Mercadona", "brand": "Hacendado", "grams": 50, "kcal": 185, "protein": 6.5, "carbs": 30, "fat": 3.5, "source": "URL o nombre de la fuente", "confidence": "alta/media/baja", "fromPhoto": ${mode === 'photo'} } ]

Reglas:
- Detecta alimento, marca y cantidad.
- Para productos específicos, busca en internet antes de responder.
- Prioriza: web oficial del supermercado o marca, etiqueta nutricional, Open Food Facts, Carrefour, Mercadona, Eroski, Dia, Alcampo u otra fuente fiable.
- Calcula los macros según la dosis indicada. Si un producto tiene 370 kcal por 100 g y el usuario pide 50 g, devuelve 185 kcal.
- Usa gramos como unidad final. Para ml, estima gramos razonablemente salvo que la densidad sea clara.
- Si no encuentras producto exacto, usa una estimación razonable y confidence media o baja.
- Si la cantidad no está clara, estima una ración típica y confidence media o baja.
- Redondea kcal a entero y macros a 1 decimal.
- source debe incluir URL si está disponible; si no, nombre de fuente o "estimación genérica".
- ${mode === 'photo' ? 'Analiza la foto, detecta alimentos visibles, estima cantidades aproximadas y marca fromPhoto true.' : 'Marca fromPhoto false.'}`;
}

async function parseResponse(response) {
  const text = response.output_text?.trim();
  if (!text) throw new Error('La IA no devolvió texto.');
  const data = JSON.parse(text);
  return data.map(item => ({
    name: String(item.name || 'Alimento'),
    brand: String(item.brand || ''),
    grams: Number(item.grams || 0),
    kcal: Number(item.kcal || 0),
    protein: Number(item.protein || 0),
    carbs: Number(item.carbs || 0),
    fat: Number(item.fat || 0),
    source: String(item.source || 'estimación genérica'),
    confidence: ['alta', 'media', 'baja'].includes(item.confidence) ? item.confidence : 'media',
    fromPhoto: Boolean(item.fromPhoto)
  }));
}

app.post('/api/food/text', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Falta texto.' });

    const response = await openai.responses.create({
      model,
      tools: [{ type: 'web_search_preview' }],
      input: [
        { role: 'system', content: systemPrompt('text') },
        { role: 'user', content: `Analiza y calcula este registro nutricional: ${text}` }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: foodSchema.name,
          schema: foodSchema.schema,
          strict: true
        }
      }
    });

    res.json(await parseResponse(response));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo analizar el alimento.' });
  }
});

app.post('/api/food/photo', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Falta foto.' });
    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

    const response = await openai.responses.create({
      model,
      tools: [{ type: 'web_search_preview' }],
      input: [
        { role: 'system', content: systemPrompt('photo') },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Detecta los alimentos de esta foto, estima cantidades y calcula kcal/macros. Devuelve solo JSON.' },
            { type: 'input_image', image_url: dataUrl }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: foodSchema.name,
          schema: foodSchema.schema,
          strict: true
        }
      }
    });

    res.json(await parseResponse(response));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo analizar la foto.' });
  }
});

app.listen(port, () => {
  console.log(`Ticket Macros AI listo en http://localhost:${port}`);
});
