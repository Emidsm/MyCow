# Sistema de Diseño: PWA React

Este documento define las directrices visuales, los tokens de diseño y las especificaciones de la Progressive Web App (PWA), garantizando consistencia en todas las resoluciones (Mobile First) y soporte para temas claro/oscuro.

---

## 1. Tipografía

Se utiliza la familia tipográfica de Google Fonts: **Inter** e **Inter Tight**.

* **Títulos y Encabezados (Display / Headings):** `Inter Tight`, sans-serif.
    * *Peso recomendado:* SemiBold (600) y Bold (700).
    * *Uso:* H1 a H6, títulos de tarjetas, modales.
* **Cuerpo de Texto y UI (Body / UI):** `Inter`, sans-serif.
    * *Peso recomendado:* Regular (400) y Medium (500).
    * *Uso:* Párrafos, botones, etiquetas, navegación.

---

## 2. Paleta de Colores (Design Tokens)

Los colores base han sido extraídos de la paleta "Cowhide" referenciada, con ajustes para crear un Modo Oscuro congruente.

### Colores Base (Extraídos de la paleta)
* `--color-cow-900`: `#301106` (Marrón muy oscuro)
* `--color-cow-700`: `#4d2712` (Marrón chocolate)
* `--color-cow-500`: `#846550` (Marrón terracota/tostado)
* `--color-cow-300`: `#bfafa2` (Topo / Gris cálido)
* `--color-cow-100`: `#daccc0` (Beige claro)

### Modo Claro (Light Theme)
Diseñado para dar una sensación limpia, cálida y natural.

* `--bg-primary`: `#f8f6f4` (Fondo general de la app, versión ultraclara del beige)
* `--bg-surface`: `#daccc0` (Fondo para tarjetas, modales y barras de navegación)
* `--text-primary`: `#301106` (Textos principales, máximo contraste)
* `--text-secondary`: `#4d2712` (Subtítulos, descripciones)
* `--brand-primary`: `#4d2712` (Color principal de botones y acciones destacadas)
* `--brand-hover`: `#301106` (Estado hover de botones principales)
* `--border-color`: `#bfafa2` (Líneas divisorias, bordes de inputs)

### Modo Oscuro (Dark Theme)
Diseñado para reducir la fatiga visual, invirtiendo la paleta hacia los tonos más oscuros pero manteniendo la calidez.

* `--bg-primary`: `#170803` (Fondo general, derivado más oscuro del `#301106`)
* `--bg-surface`: `#301106` (Fondo para tarjetas y modales)
* `--text-primary`: `#daccc0` (Textos principales, beige claro)
* `--text-secondary`: `#bfafa2` (Subtítulos, descripciones)
* `--brand-primary`: `#846550` (Color principal de botones, más claro para destacar en fondo oscuro)
* `--brand-hover`: `#bfafa2` (Estado hover de botones)
* `--border-color`: `#4d2712` (Líneas divisorias)

---

## 3. Espaciado y Layout (Responsive)

El sistema utiliza una escala basada en `rem` (asumiendo 1rem = 16px) para garantizar escalabilidad.

* `--spacing-xs`: 0.25rem (4px)
* `--spacing-sm`: 0.5rem (8px)
* `--spacing-md`: 1rem (16px) - *Padding estándar en Mobile*
* `--spacing-lg`: 1.5rem (24px)
* `--spacing-xl`: 2rem (32px) - *Padding estándar en Desktop*

**Breakpoints (Tailwind/Estándar):**
* `sm`: 640px (Tablets pequeñas / Landscape)
* `md`: 768px (Tablets)
* `lg`: 1024px (Desktop)
* `xl`: 1280px (Pantallas grandes)

---

## 4. Radios de Borde (Border Radius)

Para suavizar la interfaz y combinar con la naturaleza orgánica de la paleta:
* `--radius-sm`: 4px (Checkboxes, etiquetas pequeñas)
* `--radius-md`: 8px (Botones, inputs)
* `--radius-lg`: 16px (Tarjetas, modales)
* `--radius-full`: 9999px (Avatares, botones flotantes - FAB)

---

## 5. Especificaciones PWA (`manifest.json`)

Para que la instalación de la PWA sea coherente con el diseño, estos son los valores sugeridos para el manifiesto de React:

```json
{
  "short_name": "AppName",
  "name": "AppName - Tu eslogan aquí",
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#daccc0", 
  "background_color": "#f8f6f4",
  "orientation": "portrait",
  "icons": [
    {
      "src": "favicon.ico",
      "sizes": "64x64 32x32 24x24 16x16",
      "type": "image/x-icon"
    },
    {
      "src": "logo192.png",
      "type": "image/png",
      "sizes": "192x192",
      "purpose": "any maskable"
    },
    {
      "src": "logo512.png",
      "type": "image/png",
      "sizes": "512x512",
      "purpose": "any maskable"
    }
  ]
}
