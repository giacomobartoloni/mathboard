# MathBoard SEO — Piano tecnico di implementazione

**Stato:** specifica pronta per coding agent  
**Data:** 2026-10-02  
**Progetto:** MathBoard — `https://mathboard.app/`  
**Repository analizzato:** `giacomobartoloni/mathboard`  
**Obiettivo:** aumentare il traffico organico senza trasformare MathBoard in un sito di contenuti generici e senza alterare l’esperienza della board su `/`.

---

## 0. Executive summary

MathBoard deve restare prima di tutto un’applicazione. La route `/` deve continuare ad aprire direttamente la board, senza hero marketing, interstitial, landing page o testo SEO aggiunto sopra/sotto la canvas.

La strategia consigliata è costruire **una piccola superficie SEO statica attorno all’app**, composta da pagine che abbiano una ragione d’esistere anche senza Google: documentazione reale, reference, esempi LaTeX, spiegazioni di prodotto concise e risorse open-source.

L’implementazione raccomandata non richiede Nuxt, SSR, `vue-router` o una migrazione del frontend. L’app attuale rimane Vue 3 + Vite. Dopo `vite build`, uno script Node genera poche pagine HTML statiche direttamente dentro `dist/`, ad esempio:

```text
/
/                     -> app Vue, invariata
/resources/           -> hub delle risorse
/math-whiteboard/      -> pagina prodotto/category
/latex-whiteboard/     -> pagina prodotto + esempi LaTeX reali
/open-source-math-whiteboard/
/docs/keyboard-shortcuts/
/docs/latex/
```

Cloudflare serve già `./dist` come static assets, quindi i file generati come `dist/<slug>/index.html` sono compatibili con l’architettura corrente.

### Principio guida

> Non creare una pagina perché esiste una keyword. Creare una pagina perché offre un contenuto o una funzione utile; poi descriverla con il linguaggio che le persone cercano.

Questa specifica vieta esplicitamente:

- blog farm;
- contenuti “10 best…” generici;
- pagine quasi duplicate per singole varianti di keyword;
- FAQ inventate per occupare spazio;
- testo nascosto o visually-hidden usato per SEO;
- paragrafi introduttivi generici;
- statistiche non verificabili;
- testimonial inventati;
- contenuti generati in massa;
- route programmatiche del tipo `/whiteboard-for-{subject}` senza vero valore distinto.

---

# 1. Stato tecnico attuale osservato

Questa sezione documenta il baseline del repository analizzato, così il coding agent non deve assumere una struttura diversa da quella reale.

## 1.1 Stack

Dal repository corrente:

- Vue 3;
- Vite 6;
- nessun `vue-router` presente nelle dependencies;
- Fabric.js per la board;
- KaTeX per le formule;
- deploy di asset statici su Cloudflare Workers;
- output di produzione in `dist/`;
- analytics via Simple Analytics.

File rilevanti:

```text
package.json
vite.config.js
wrangler.json
index.html
src/main.js
src/App.vue
src/components/FormulaModal.vue
src/components/SupportPanel.vue
src/components/ToolsPanel.vue
src/config/shortcuts.js
src/config/themes.js
src/config/colors.js
src/analytics/index.js
src/analytics/events.js
public/robots.txt
public/sitemap.xml
public/manifest.json
```

## 1.2 Build e hosting correnti

`package.json` usa attualmente:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint --ext .js,.vue src/"
  }
}
```

`wrangler.json`:

```json
{
  "name": "mathboard",
  "compatibility_date": "2026-02-13",
  "assets": {
    "directory": "./dist"
  }
}
```

Questa architettura è sufficiente per aggiungere pagine statiche. Non è necessario introdurre un server applicativo.

## 1.3 Home attuale

`index.html` ha già:

- `<title>`;
- meta description;
- Open Graph;
- Twitter metadata;
- canonical;
- manifest;
- JSON-LD `SoftwareApplication`;
- `robots.txt` che consente il crawl;
- sitemap dichiarata.

Il body HTML iniziale, però, contiene sostanzialmente:

```html
<noscript>...</noscript>
<div id="app"></div>
<script type="module" src="/src/main.js"></script>
```

Questo non è un bug: `/` è un’app client-side e deve restarlo.

La soluzione **non** è aggiungere blocchi SEO nascosti alla home. La soluzione è pubblicare URL statici separati, con contenuto utile e HTML immediatamente disponibile.

## 1.4 Sitemap attuale

`public/sitemap.xml` contiene solo `/` e un `lastmod` fisso.

Questa sitemap dovrà diventare generata automaticamente dalla stessa fonte dati usata per costruire le pagine SEO, per evitare drift tra URL esistenti e URL dichiarati.

## 1.5 Funzionalità reali da cui derivare i contenuti

Non descrivere feature che non esistono.

Dal codice attuale risultano verificabili almeno:

- freehand pen;
- select;
- pan;
- testo;
- inserimento formule LaTeX tramite KaTeX;
- preview formula prima dell’inserimento;
- modifica di formule esistenti;
- forme: rectangle, circle, line/arrow;
- colori penna;
- undo/redo;
- zoom;
- fullscreen;
- tre board themes: light, dark, chalkboard;
- open source AGPL v3;
- app web senza installazione obbligatoria.

Shortcut attuali:

```text
V -> Select
P -> Pen
H -> Pan
T -> Text
F -> Formula
S -> Shapes
Ctrl/Cmd + Z -> Undo
Ctrl/Cmd + Shift + Z -> Redo
Ctrl/Cmd + Y -> Redo
Delete / Backspace -> Delete selection
Escape -> cancel/close current transient action
```

Esempi LaTeX già presenti nel prodotto:

```text
E = mc^2
\frac{a}{b}
\sqrt{x^2 + y^2}
\int_{a}^{b} f(x)dx
```

Questi elementi sono ottime basi per pagine SEO perché sono **contenuto di prodotto reale**, non copy inventato.

---

# 2. Obiettivi e non-obiettivi

## 2.1 Obiettivi

L’implementazione deve:

1. lasciare `/` come MathBoard immediatamente utilizzabile;
2. creare URL distinti indicizzabili senza JavaScript;
3. intercettare intenti di ricerca vicini al prodotto;
4. dare a Google e ad altri crawler testo, link e struttura semantica reali;
5. trasformare visite SEO in aperture della board;
6. creare risorse che possano ottenere backlink in modo naturale;
7. essere semplice da mantenere nel repository attuale;
8. evitare dipendenze editoriali continue;
9. evitare contenuti che sembrino generati automaticamente;
10. permettere di aggiungere nuove pagine solo quando esiste una ragione concreta.

## 2.2 Non-obiettivi

Non implementare in questa fase:

- migrazione a Nuxt;
- SSR completo dell’app;
- CMS;
- blog;
- multi-lingua automatica;
- traduzioni generate automaticamente;
- centinaia di template matematici;
- forum/community;
- pagine programmatiche create da combinazioni di keyword;
- comparatori con concorrenti senza ricerca e test reale;
- route dinamiche di applicazione.

---

# 3. Regole editoriali anti-“AI slop”

Queste regole sono requisiti di prodotto, non suggerimenti.

## 3.1 Test di esistenza

Prima di aggiungere una pagina chiedere:

> Se Google non esistesse, questa pagina sarebbe comunque utile a un utente di MathBoard?

Se la risposta è “no”, la pagina non va pubblicata.

## 3.2 Test di unicità

Ogni URL deve avere una risposta chiara alla domanda:

> Cosa trova qui l’utente che non trova già in un’altra pagina del sito?

Se due pagine differiscono principalmente per il titolo e per sinonimi nel testo, unirle.

## 3.3 Test di prova

Ogni affermazione sul prodotto deve essere verificabile in almeno uno dei seguenti modi:

- feature presente nel codice;
- screenshot reale;
- esempio funzionante;
- link al repository;
- comportamento riproducibile nella board;
- documentazione tecnica.

Non scrivere:

```text
The most powerful...
The ultimate...
Revolutionary...
Industry-leading...
Trusted by thousands...
Boost productivity by 300%...
```

salvo prova pubblica specifica, e anche in quel caso preferire formulazioni fattuali.

## 3.4 Lunghezza

Non esiste una word count target.

Una pagina può essere 250 parole se risponde bene all’intento. Non allungare il testo per “SEO”.

Indicativamente:

- landing prodotto: 250–600 parole;
- reference: quanto serve;
- docs: quanto serve;
- hub: 100–250 parole;
- esempi: il valore può stare nel codice/render, non nel prose.

## 3.5 Vietato il riempitivo

Eliminare frasi come:

```text
In today's digital world...
Mathematics has always been...
Whether you're a student, teacher, professional, or enthusiast...
Finding the right tools can be challenging...
In this comprehensive guide...
```

Partire direttamente dal problema o dalla funzione.

## 3.6 Nessun “FAQ SEO block” automatico

Aggiungere FAQ solo quando:

- la domanda arriva davvero da utenti/issues/Search Console;
- la risposta non è già evidente nella pagina;
- la domanda merita di essere mantenuta nel tempo.

Nessun componente FAQ di default nel template.

## 3.7 Nessuna generazione automatica di testo in build

Il build script deve generare markup, non copy.

Consentito:

- generare HTML da contenuto scritto e versionato nel repository;
- generare tabelle da configurazioni del prodotto;
- renderizzare KaTeX da esempi espliciti;
- generare sitemap.

Vietato:

- chiamare un LLM in build;
- generare descrizioni da keyword;
- espandere automaticamente liste di sinonimi;
- generare pagine da un CSV di keyword.

---

# 4. Architettura raccomandata

## 4.1 Decisione

Mantenere l’app Vue su `/` e aggiungere **Static SEO Sidecar Pages** generate dopo la build Vite.

Flusso:

```text
npm run build
    |
    +--> vite build
    |      |
    |      +--> dist/index.html
    |      +--> dist/assets/*
    |      +--> files copied from public/
    |
    +--> node tools/build-seo.mjs
           |
           +--> dist/resources/index.html
           +--> dist/math-whiteboard/index.html
           +--> dist/latex-whiteboard/index.html
           +--> dist/open-source-math-whiteboard/index.html
           +--> dist/docs/keyboard-shortcuts/index.html
           +--> dist/docs/latex/index.html
           +--> dist/sitemap.xml
           +--> dist/404.html
```

## 4.2 Perché questa soluzione

Vantaggi:

- `/` non cambia;
- nessun router introdotto nell’app;
- nessun hydration cost sulle pagine SEO;
- HTML disponibile nella risposta iniziale;
- deployment invariato;
- pagine molto veloci;
- manutenzione semplice;
- nessuna dipendenza da runtime server;
- rollback semplice;
- contenuto versionato insieme al prodotto.

## 4.3 Perché non Nuxt/SSR ora

Nuxt/SSR risolverebbe un problema più grande di quello esistente e aumenterebbe:

- complessità della build;
- superficie di regressione;
- differenza tra app attuale e nuovo runtime;
- tempo di manutenzione;
- necessità di decisioni su hydration, state e browser-only APIs di Fabric.

MathBoard non ha bisogno di renderizzare la canvas lato server. Ha bisogno di URL HTML utili intorno alla canvas.

## 4.4 Perché non `vue-router`

Le pagine SEO non necessitano di comportamento SPA.

Aggiungere `vue-router` significherebbe comunque inviare e inizializzare Vue per pagine principalmente statiche e introdurrebbe il problema del rendering client-side che stiamo cercando di evitare.

---

# 5. Struttura file proposta

Creare:

```text
seo/
  pages/
    resources.mjs
    math-whiteboard.mjs
    latex-whiteboard.mjs
    open-source-math-whiteboard.mjs
    keyboard-shortcuts.mjs
    latex-docs.mjs
  lib/
    escape-html.mjs
    render-layout.mjs
    render-components.mjs
    structured-data.mjs
  assets/
    seo.css
    seo.js
  README.md

tools/
  build-seo.mjs
```

In alternativa, gli asset possono stare in `public/seo/`:

```text
public/
  seo/
    seo.css
    seo.js
    images/
```

Questa seconda opzione è più semplice perché Vite li copia già in `dist/seo/`.

### Raccomandazione

Usare:

```text
public/seo/seo.css
public/seo/seo.js
public/seo/images/*
```

ed evitare al build script di dover copiare asset.

---

# 6. Modifica package.json

Cambiare gli script in modo che la build SEO sia parte obbligatoria della produzione.

Proposta:

```json
{
  "scripts": {
    "dev": "vite",
    "build:app": "vite build",
    "build:seo": "node tools/build-seo.mjs",
    "build": "npm run build:app && npm run build:seo",
    "preview": "vite preview",
    "lint": "eslint --ext .js,.vue src/",
    "generate:icons": "node tools/generate-icons.mjs"
  }
}
```

`build-seo.mjs` deve fallire con exit code != 0 se:

- due pagine hanno la stessa path;
- manca title;
- manca description;
- manca H1;
- canonical non coincide con path;
- un internal link punta a una route SEO inesistente;
- viene generata una pagina vuota;
- esistono URL duplicati in sitemap.

Il build deve essere “fail closed”: meglio interrompere deploy che pubblicare SEO rotto.

---

# 7. Data model delle pagine

Non usare un template editoriale rigido che costringa tutte le pagine ad avere le stesse sezioni.

Il layout può essere condiviso; il body deve poter essere completamente specifico.

Esempio:

```js
// seo/pages/math-whiteboard.mjs
export default {
  path: '/math-whiteboard/',
  title: 'MathBoard — Free Online Whiteboard for Math',
  description: 'Draw, write text, and add LaTeX formulas on a browser-based math whiteboard. Free and open source.',
  h1: 'A whiteboard built for math',
  ogImage: '/seo/images/math-whiteboard.png',
  structuredData: 'software-application',
  body: `
    <p class="lede">
      Draw freehand, add text and formulas, and switch between light,
      dark, and chalkboard themes. MathBoard runs in the browser and is open source.
    </p>
    ...
  `
}
```

Il body è volutamente esplicito e scritto a mano.

### Requisito

Non creare funzioni tipo:

```js
createSeoPage({ keyword, audience, feature })
```

che producano copy da combinazioni di parametri.

Si possono condividere solo componenti strutturali:

```js
renderHeader()
renderFooter()
renderCTA()
renderCodeExample()
renderScreenshot()
renderBreadcrumbs()
```

---

# 8. Build generator — comportamento richiesto

`tools/build-seo.mjs` deve:

1. importare tutte le page definitions;
2. validarle;
3. creare le directory dentro `dist/`;
4. renderizzare il layout HTML;
5. scrivere `<path>/index.html`;
6. generare sitemap;
7. generare una 404;
8. stampare un report di build leggibile.

Output esempio:

```text
SEO build
✓ /resources/
✓ /math-whiteboard/
✓ /latex-whiteboard/
✓ /open-source-math-whiteboard/
✓ /docs/keyboard-shortcuts/
✓ /docs/latex/
✓ sitemap.xml (7 URLs including /)
✓ 404.html
```

## 8.1 Pseudocodice

```js
import fs from 'node:fs/promises'
import path from 'node:path'

import resources from '../seo/pages/resources.mjs'
import mathWhiteboard from '../seo/pages/math-whiteboard.mjs'
import latexWhiteboard from '../seo/pages/latex-whiteboard.mjs'
import openSource from '../seo/pages/open-source-math-whiteboard.mjs'
import shortcuts from '../seo/pages/keyboard-shortcuts.mjs'
import latexDocs from '../seo/pages/latex-docs.mjs'
import { renderLayout } from '../seo/lib/render-layout.mjs'

const DIST = path.resolve('dist')
const ORIGIN = 'https://mathboard.app'

const pages = [
  resources,
  mathWhiteboard,
  latexWhiteboard,
  openSource,
  shortcuts,
  latexDocs,
]

validatePages(pages)

for (const page of pages) {
  const relative = page.path.replace(/^\//, '').replace(/\/$/, '')
  const dir = path.join(DIST, relative)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'index.html'),
    renderLayout(page),
    'utf8',
  )
}

await writeSitemap({ origin: ORIGIN, pages })
await write404()
```

Il coding agent può adattare l’implementazione, ma deve mantenere queste proprietà architetturali.

---

# 9. HTML layout richiesto

Ogni pagina SEO deve restituire HTML completo nella response iniziale.

Skeleton:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>...</title>
  <meta name="description" content="...">
  <link rel="canonical" href="https://mathboard.app/.../">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="MathBoard">
  <meta property="og:title" content="...">
  <meta property="og:description" content="...">
  <meta property="og:url" content="https://mathboard.app/.../">
  <meta property="og:image" content="https://mathboard.app/seo/images/...">

  <meta name="twitter:card" content="summary_large_image">

  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/seo/seo.css">

  <script type="application/ld+json">...</script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>

  <header class="site-header">
    <a href="/" class="brand">MathBoard</a>
    <nav aria-label="Primary">
      <a href="/resources/">Resources</a>
      <a href="https://github.com/giacomobartoloni/mathboard">GitHub</a>
      <a class="button" href="/">Open MathBoard</a>
    </nav>
  </header>

  <main id="main">
    ... unique page content ...
  </main>

  <footer>
    ...
  </footer>

  <script src="/seo/seo.js" defer></script>
</body>
</html>
```

## 9.1 Semantic HTML

Usare:

- un solo `<h1>`;
- `<h2>` per sezioni reali;
- `<p>` per testo;
- `<ul>` solo per liste reali;
- `<code>` e `<pre>` per LaTeX/shortcut;
- `<table>` per reference tabellari;
- `<figure>` + `<figcaption>` per screenshot significativi;
- `<nav>` per navigazione;
- `<main>` e `<footer>`.

Non usare heading solo per aumentare densità di keyword.

## 9.2 Lingua

Prima release: **English only**, perché il prodotto e le query target sono prevalentemente descritte in inglese e perché una traduzione automatica moltiplicherebbe le pagine senza valore aggiuntivo.

Aggiungere italiano solo quando:

- esiste contenuto italiano scritto/revisionato umanamente;
- Search Console mostra domanda sufficiente;
- vengono implementati correttamente `hreflang` e canonical.

---

# 10. URL e trailing slash

Usare URL canonici con trailing slash:

```text
/math-whiteboard/
/latex-whiteboard/
/docs/latex/
```

Motivazione tecnica: le pagine saranno file `index.html` dentro directory. Cloudflare Static Assets, con `html_handling` automatico, tratta naturalmente queste route come directory URL.

Rendere esplicita l’intenzione in `wrangler.json`:

```json
{
  "name": "mathboard",
  "compatibility_date": "2026-02-13",
  "assets": {
    "directory": "./dist",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "404-page"
  }
}
```

### IMPORTANTE

Non configurare:

```json
"not_found_handling": "single-page-application"
```

in questa architettura, a meno che non venga introdotto in futuro un vero router client-side che lo richieda.

Con l’attuale app senza router, il fallback SPA trasformerebbe URL inesistenti in risposte `200` con la home, creando potenziali soft-404 e rendendo più difficile distinguere pagine vere da URL errati.

Prima di modificare questa opzione verificare comunque il comportamento effettivo in staging.

---

# 11. Pagine da implementare — Phase 1

La Phase 1 deve essere piccola. Pubblicare **sei** pagine ben fatte è preferibile a cinquanta pagine mediocri.

---

## 11.1 `/resources/`

### Scopo

Hub umano e crawlable che collega tutte le risorse pubbliche.

### Non è

Una landing piena di keyword.

### Title

```text
MathBoard Resources — Guides, LaTeX and Shortcuts
```

### Meta description

```text
Practical MathBoard resources: LaTeX examples, keyboard shortcuts, product guides, and the open-source repository.
```

### H1

```text
MathBoard resources
```

### Contenuto

Intro molto breve:

```text
Short references and guides for using MathBoard. No account or setup guide is required to start drawing — open the board whenever you want.
```

Cards/link:

- Math whiteboard overview;
- LaTeX whiteboard;
- LaTeX reference;
- keyboard shortcuts;
- open-source page;
- GitHub repository.

Ogni card deve essere un normale `<a href>` crawlable.

### Valore reale

È il punto di accesso umano alla documentazione e crea internal linking pulito.

---

## 11.2 `/math-whiteboard/`

### Intento

Category/product discovery.

Query family da coprire nella **stessa pagina**, senza creare cloni:

```text
math whiteboard
online math whiteboard
whiteboard for math
mathematics whiteboard
online whiteboard for mathematics
```

Non creare una route per ciascuna variante.

### Title

```text
MathBoard — Free Online Whiteboard for Math
```

### Meta description

```text
A browser-based whiteboard for math: draw freehand, write text, add LaTeX formulas, use shapes, and switch between light, dark, and chalkboard themes.
```

### H1

```text
A whiteboard built for math
```

### Lede suggerita

Usare copy essenziale, ad esempio:

```text
MathBoard combines freehand drawing, text, shapes, and LaTeX formulas on one canvas. It runs in the browser and is free and open source.
```

### Elementi obbligatori

1. screenshot reale della board;
2. CTA `Open MathBoard`;
3. elenco breve di feature, solo feature esistenti;
4. una sezione “Why a math-specific whiteboard?” con differenze concrete, non marketing;
5. link a `/latex-whiteboard/`;
6. link a `/docs/keyboard-shortcuts/`;
7. link GitHub.

### “Why” — contenuti fattuali

Possibili punti:

- passare dal disegno a una formula senza lasciare la canvas;
- usare formule renderizzate invece di affidarsi solo alla scrittura a mano;
- usare board theme light/dark/chalkboard;
- lavorare senza installare software desktop.

Non affermare che MathBoard sia “better than” prodotti specifici senza confronto verificato.

---

## 11.3 `/latex-whiteboard/`

Questa è probabilmente la pagina SEO più importante perché collega una capability differenziante a un intento di ricerca molto preciso.

### Query family

```text
latex whiteboard
whiteboard with latex
online whiteboard latex
math whiteboard latex
write latex on whiteboard
```

Una pagina sola.

### Title

```text
LaTeX Whiteboard — Draw and Add Math Formulas | MathBoard
```

### Meta description

```text
Draw on a browser whiteboard and insert rendered LaTeX formulas with live preview. MathBoard uses KaTeX and is free and open source.
```

### H1

```text
Draw first. Drop in LaTeX when you need it.
```

### Copy iniziale

```text
Use the Formula tool to type LaTeX, preview the result, and place the rendered formula on the board. Existing formulas can be selected and edited again.
```

### Esempi obbligatori

Mostrare source + render per almeno:

```latex
E = mc^2
```

```latex
\frac{a}{b}
```

```latex
\sqrt{x^2 + y^2}
```

```latex
\int_{a}^{b} f(x)\,dx
```

### Implementazione degli esempi

Non usare immagini prerenderizzate se non necessario.

Dato che `katex` è già dependency del progetto, `build-seo.mjs` può usare:

```js
import katex from 'katex'

const html = katex.renderToString(source, {
  displayMode: true,
  throwOnError: true,
  strict: false,
})
```

La pagina dovrà includere il CSS KaTeX necessario.

Due opzioni:

1. copiare `katex.min.css` e font nel build SEO;
2. creare un piccolo entry CSS processato da Vite.

Preferire asset locali, non CDN.

### How-to

Solo tre passaggi, perché sono veri:

```text
1. Select Formula (or press F).
2. Type LaTeX and check the preview.
3. Insert it on the canvas; select it later to edit it again.
```

### CTA

```text
Open MathBoard
```

Niente `Start creating beautiful mathematical content today!`.

---

## 11.4 `/open-source-math-whiteboard/`

### Perché esiste

È una caratteristica concreta e differenziante, utile per:

- docenti;
- istituzioni;
- sviluppatori;
- utenti che preferiscono tool verificabili;
- backlink da raccolte open-source.

### Title

```text
Open-Source Math Whiteboard — MathBoard
```

### Meta description

```text
MathBoard is a free, browser-based math whiteboard released under the GNU AGPL v3. View the source, report issues, or contribute on GitHub.
```

### H1

```text
An open-source whiteboard for math
```

### Contenuto obbligatorio

- AGPL v3;
- link repository;
- link Issues;
- istruzioni minime per local development prese dal README;
- stack sintetico: Vue, Fabric.js, KaTeX;
- CTA `Open MathBoard`;
- CTA `View source on GitHub`.

### Vietato

Non spiegare 1.500 parole su “why open source matters”.

Questa pagina deve sembrare documentazione di progetto, non un articolo SEO.

---

## 11.5 `/docs/keyboard-shortcuts/`

Questa pagina è importante per due motivi:

1. è genuinamente utile;
2. crea contenuto indicizzabile derivato direttamente dal prodotto.

### Title

```text
MathBoard Keyboard Shortcuts
```

### Meta description

```text
Keyboard shortcuts for MathBoard tools, undo and redo, deleting selections, and cancelling actions.
```

### H1

```text
Keyboard shortcuts
```

### Tabelle

Tool shortcuts:

| Key | Action |
| --- | --- |
| `V` | Select |
| `P` | Pen |
| `H` | Pan |
| `T` | Text |
| `F` | Formula |
| `S` | Shapes |

Editing:

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + Y` | Redo |
| `Delete` / `Backspace` | Delete selection |
| `Escape` | Cancel or close the current transient action |

### Evitare drift

Idealmente, spostare la reference in un export machine-readable dentro `src/config/shortcuts.js`.

Esempio:

```js
export const SHORTCUT_REFERENCE = Object.freeze([
  { keys: ['V'], action: 'Select', group: 'tools' },
  { keys: ['P'], action: 'Pen', group: 'tools' },
  { keys: ['H'], action: 'Pan', group: 'tools' },
  { keys: ['T'], action: 'Text', group: 'tools' },
  { keys: ['F'], action: 'Formula', group: 'tools' },
  { keys: ['S'], action: 'Shapes', group: 'tools' },
  { keys: ['Ctrl/Cmd', 'Z'], action: 'Undo', group: 'editing' },
  // ...
])
```

Il generator SEO può importare questa struttura, mentre la logica keyboard esistente rimane invariata.

Questo è preferibile al duplicare manualmente la tabella in HTML.

---

## 11.6 `/docs/latex/`

### Scopo

Reference breve per ciò che un utente può inserire nel Formula tool.

Non deve tentare di sostituire la documentazione completa di LaTeX o KaTeX.

### Title

```text
LaTeX in MathBoard — Formula Examples
```

### Meta description

```text
Quick LaTeX examples for MathBoard formulas: fractions, roots, powers, integrals, sums, Greek letters, and common math notation.
```

### H1

```text
LaTeX formula examples
```

### Contenuto

Sezioni concise:

```text
Fractions
Powers and roots
Integrals and sums
Greek letters
Subscripts and superscripts
Brackets
```

Ogni esempio deve avere:

- source LaTeX copiabile;
- output renderizzato con la stessa libreria KaTeX usata nell’app;
- zero prose se non serve.

Esempio:

```html
<div class="formula-example">
  <pre><code>\frac{x+1}{x-1}</code></pre>
  <div class="formula-render">...</div>
</div>
```

### Accuratezza

Solo esempi che passano `katex.renderToString(..., throwOnError: true)` durante build.

Se un esempio non compila, la build deve fallire.

Questo trasforma la pagina in una piccola suite di validazione oltre che in contenuto.

---

# 12. Pagine da NON creare subito

Non creare ancora:

```text
/whiteboard-for-algebra/
/whiteboard-for-calculus/
/whiteboard-for-geometry/
/whiteboard-for-statistics/
/whiteboard-for-students/
/whiteboard-for-professors/
/whiteboard-for-middle-school/
/whiteboard-for-high-school/
```

Queste sono candidate classiche a diventare doorway pages con contenuto quasi identico.

Crearne una solo se diventa una **feature/use case specifico**, per esempio una futura pagina Geometry che carica davvero strumenti o template geometrici distinti.

---

# 13. Phase 2 — pagine candidate, solo dopo dati reali

Dopo 6–12 settimane di Search Console, valutare.

## 13.1 `/for-math-teachers/`

Creare solo se:

- Search Console mostra impression consistenti su query teacher-specific;
- è possibile descrivere un workflow docente concreto;
- esistono screenshot/demo specifici;
- il contenuto sarebbe chiaramente diverso da `/math-whiteboard/`.

## 13.2 `/for-math-tutors/`

Stesse condizioni.

Non creare sia teachers sia tutors se il testo risultante è sostanzialmente lo stesso.

## 13.3 Template pages

Le pagine template sarebbero molto interessanti, ma **solo dopo che il prodotto può realmente caricare uno stato/template**.

Esempi futuri:

```text
/templates/coordinate-plane/
/templates/unit-circle/
/templates/graph-paper/
```

La pagina dovrebbe aprire una board pronta, non essere una landing che descrive un template inesistente.

Pattern ideale futuro:

```text
Google -> template utile -> Open in MathBoard -> board precaricata
```

Questo è molto più forte di un blog post.

---

# 14. Root `/` — cosa cambiare e cosa NON cambiare

## 14.1 UX

**Non cambiare l’esperienza visiva principale.**

L’utente che visita `https://mathboard.app/` deve continuare a vedere immediatamente la board.

Niente:

- splash screen;
- hero;
- modal marketing iniziale;
- testo sotto la board;
- scroll verticale introdotto per SEO.

## 14.2 Metadata

La home ha già metadata solidi. Rifinire soltanto il copy se desiderato.

Proposta title:

```text
MathBoard — Free Online Math Whiteboard with LaTeX
```

Proposta description:

```text
Free browser-based math whiteboard with freehand drawing, text, shapes, and editable LaTeX formulas. Open source and ready to use without installation.
```

Il title attuale “Interactive Digital Whiteboard for Math Teachers” è comunque valido; il cambio non è un blocker.

### Nota `meta keywords`

Il tag `meta name="keywords"` non è necessario. Può essere rimosso per ridurre rumore, ma non è una priorità.

## 14.3 JSON-LD

Mantenere `SoftwareApplication` sulla home.

Verificare che tutte le proprietà descrivano il prodotto corrente.

Non aggiungere rating, review count o aggregateRating se non esistono dati pubblici reali.

### Privacy

L’email dell’autore non è necessaria nello structured data. Se non si vuole renderla ulteriormente machine-readable, rimuovere `author.email`.

## 14.4 Link alle resources senza alterare la board

Aggiungere dentro il modal `About` di `SupportPanel.vue` un link visibile:

```text
Resources & shortcuts
```

che punta a:

```text
/resources/
```

Posizione suggerita: vicino a GitHub / legal links.

Questo non cambia la home principale ma crea un percorso umano dalla board alla documentazione.

Non aggiungere una barra di navigazione permanente sulla canvas solo per SEO.

---

# 15. Internal linking

Ogni pagina SEO deve essere raggiungibile da almeno una pagina HTML indicizzabile, oltre che dalla sitemap.

Graph suggerito:

```text
/resources/
  -> /math-whiteboard/
  -> /latex-whiteboard/
  -> /open-source-math-whiteboard/
  -> /docs/keyboard-shortcuts/
  -> /docs/latex/

/math-whiteboard/
  -> /
  -> /latex-whiteboard/
  -> /docs/keyboard-shortcuts/
  -> /open-source-math-whiteboard/

/latex-whiteboard/
  -> /
  -> /docs/latex/
  -> /math-whiteboard/

/docs/latex/
  -> /latex-whiteboard/
  -> /

/docs/keyboard-shortcuts/
  -> /
  -> /resources/

/open-source-math-whiteboard/
  -> /
  -> GitHub
  -> /resources/
```

### Anchor text

Usare anchor descrittivi naturali:

```text
LaTeX formula examples
keyboard shortcuts
open-source repository
online math whiteboard
```

Non usare la stessa exact-match keyword in tutti i link.

---

# 16. Sitemap

Eliminare la sitemap hardcoded come fonte di verità.

`build-seo.mjs` deve generare `dist/sitemap.xml`.

URL iniziali:

```text
https://mathboard.app/
https://mathboard.app/resources/
https://mathboard.app/math-whiteboard/
https://mathboard.app/latex-whiteboard/
https://mathboard.app/open-source-math-whiteboard/
https://mathboard.app/docs/keyboard-shortcuts/
https://mathboard.app/docs/latex/
```

## 16.1 `lastmod`

Non impostare `lastmod` fittizio a ogni build se il contenuto non è cambiato.

Opzioni, in ordine di preferenza:

1. derivare la data dall’ultimo commit Git che modifica il file pagina;
2. mantenere un `updated` esplicito nella page definition;
3. omettere `lastmod`.

Non impostare sempre `new Date()` perché comunica aggiornamenti inesistenti.

## 16.2 `priority` e `changefreq`

Non sono necessari. Ometterli.

Sitemap minimal:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://mathboard.app/</loc>
  </url>
  ...
</urlset>
```

---

# 17. robots.txt

La versione attuale è sostanzialmente corretta:

```text
User-agent: *
Allow: /
Sitemap: https://mathboard.app/sitemap.xml
```

Non bloccare `/seo/` se contiene asset necessari al rendering.

Non bloccare le pagine docs.

Non aggiungere regole per “AI bots” dentro questo progetto SEO senza una decisione separata di prodotto/legal: è un tema diverso dall’indicizzazione Google.

---

# 18. Canonical

Ogni pagina deve canonizzare a se stessa.

Esempio:

```html
<link rel="canonical" href="https://mathboard.app/latex-whiteboard/">
```

Vietato mettere canonical di tutte le pagine verso `/`.

Questo direbbe ai motori che le pagine SEO sono duplicati della home e ne annullerebbe il valore.

---

# 19. Structured data

## 19.1 Home

`SoftwareApplication` è appropriato.

## 19.2 Landing prodotto

Per `/math-whiteboard/` e `/latex-whiteboard/`, usare structured data con moderazione.

Opzioni:

- `SoftwareApplication` se la pagina descrive direttamente MathBoard;
- `WebPage` + breadcrumb se si vuole restare più conservativi.

Non serve aggiungere molti tipi schema solo perché esistono.

## 19.3 Docs

Per docs/reference usare:

- `WebPage`;
- eventualmente `BreadcrumbList`.

Non aggiungere `FAQPage` senza FAQ reali.

## 19.4 Validation

Aggiungere al release checklist:

- Google Rich Results Test per pagine con structured data;
- controllo che il JSON-LD sia valid JSON;
- controllo che URL e copy siano coerenti con la pagina visibile.

---

# 20. Screenshot e media

Le immagini devono mostrare MathBoard vero.

## 20.1 Vietato

- stock photos di insegnanti davanti a lavagne;
- mockup AI di aule;
- fake UI;
- screenshot che mostrano feature non esistenti;
- illustrazioni decorative generiche.

## 20.2 Preferito

Screenshot reali:

```text
public/seo/images/math-whiteboard.webp
public/seo/images/latex-formula-modal.webp
public/seo/images/chalkboard-theme.webp
```

Aggiungere dimensioni esplicite:

```html
<img
  src="/seo/images/math-whiteboard.webp"
  width="1280"
  height="720"
  alt="MathBoard showing handwritten notes and a rendered math formula"
  loading="lazy"
  decoding="async"
>
```

Hero principale: `loading="eager"` se è above-the-fold.

## 20.3 Alt text

Descrivere l’immagine, non infilare keyword.

Buono:

```text
MathBoard with a freehand graph and a rendered quadratic formula
```

Cattivo:

```text
best free online math whiteboard latex whiteboard for teachers
```

---

# 21. CSS delle pagine SEO

Obiettivi:

- leggibilità;
- identità coerente con MathBoard;
- niente design “SEO SaaS template”;
- nessun framework CSS necessario.

## 21.1 Design direction

Riutilizzare concetti visivi dell’app:

- charcoal/dark gray;
- tan accent;
- superfici semplici;
- bordi moderati;
- tipografia system sans;
- monospace per LaTeX/code.

Non è necessario caricare Google Fonts sulle pagine SEO.

## 21.2 Layout

```css
:root {
  --bg: #f9f9f9;
  --surface: #ffffff;
  --text: #2c3e50;
  --muted: #667085;
  --border: #e5e7eb;
  --accent: tan;
  --brand-dark: rgb(61, 61, 61);
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text);
  background: var(--bg);
  line-height: 1.6;
}

main {
  width: min(100% - 32px, 960px);
  margin: 0 auto;
}
```

Evitare animazioni decorative e librerie pesanti.

---

# 22. JavaScript sulle pagine SEO

Regola: **zero JS per il contenuto principale**.

La pagina deve restare utile con JavaScript disabilitato.

`seo.js` può fare soltanto:

- analytics;
- copy-to-clipboard per LaTeX;
- miglioramenti progressivi non essenziali.

Se il JS non carica:

- testo deve esserci;
- formule devono essere già renderizzate nell’HTML build-time;
- link devono funzionare;
- navigazione deve funzionare.

---

# 23. Analytics

MathBoard usa già Simple Analytics.

Le pagine statiche non passano attraverso `src/main.js`, quindi devono includere analytics separatamente se si vuole misurarle.

## 23.1 Page views

Caricare lo stesso script di produzione già usato dall’app:

```text
https://scripts.simpleanalyticscdn.com/latest.js
```

Solo sul dominio production, se si replica la logica corrente.

## 23.2 Evento CTA

Evento consigliato:

```text
seo_cta_clicked
```

Metadata:

```json
{
  "page": "latex-whiteboard",
  "placement": "hero"
}
```

Non usare UTM per internal linking tra le pagine dello stesso sito.

## 23.3 KPI

Misurare separatamente:

### Search acquisition

- impressions;
- clicks;
- CTR;
- average position;
- query;
- landing page.

Fonte: Google Search Console.

### On-site

- page views SEO page;
- `seo_cta_clicked`;
- `board_engaged` sulla home/app;
- milestone d’uso già esistenti.

### KPI più importante

Non ottimizzare solo:

```text
organic visits
```

Ottimizzare:

```text
organic landing -> Open MathBoard -> board_engaged
```

Anche se la correlazione cross-page non viene implementata subito, questa è la funnel mental model.

---

# 24. Search Console — setup operativo

Dopo deploy:

1. verificare proprietà `mathboard.app`;
2. inviare `https://mathboard.app/sitemap.xml`;
3. URL Inspection di tutte le Phase 1 pages;
4. verificare rendered HTML;
5. richiedere indexing solo per il piccolo set iniziale;
6. attendere dati prima di espandere il sito.

Ogni 2–4 settimane esportare:

- Queries;
- Pages;
- Countries;
- Devices.

Decisioni future devono nascere da questi dati.

Esempio:

Se `/latex-whiteboard/` riceve impression per:

```text
latex whiteboard
math whiteboard latex
whiteboard with equations
```

aggiornare quella pagina.

Non creare tre nuove pagine per le tre query.

---

# 25. Content maintenance workflow

## 25.1 Una pagina nuova richiede PR dedicata

La PR deve contenere:

- ragione della pagina;
- target intent;
- valore unico;
- source/prova delle feature descritte;
- screenshot se necessario;
- title/description;
- internal links;
- sitemap generated diff/test.

## 25.2 PR template checklist

```markdown
### SEO page checklist

- [ ] This page is useful even without search traffic.
- [ ] It does not duplicate an existing page.
- [ ] Every product claim is verifiable.
- [ ] No invented statistics/testimonials.
- [ ] No generic AI-style introduction.
- [ ] Primary content exists in initial HTML.
- [ ] One descriptive H1.
- [ ] Unique title and meta description.
- [ ] Self-referencing canonical.
- [ ] Linked from at least one crawlable page.
- [ ] Added to generated sitemap.
- [ ] Images are real product screenshots.
- [ ] Mobile layout checked.
- [ ] Build and lint pass.
```

---

# 26. Automated tests consigliati

Non serve introdurre una suite browser enorme per questa feature. Aggiungere test Node semplici nel generator oppure uno script `check:seo`.

## 26.1 Static assertions

Per ogni pagina:

```text
status conceptually = output file exists
title exists and is unique
description exists and is unique
exactly one <h1>
canonical exists
canonical starts with https://mathboard.app/
canonical path matches page path
no noindex
no duplicate path
body has meaningful text
```

## 26.2 Internal links

Parse gli `href` interni noti e verificare che:

- `/` esista;
- ogni path SEO punti a una page definition;
- `/privacy-policy.html` esista se linkato;
- anchor `#...` target esistano se usati.

## 26.3 Sitemap

Test:

```text
all indexable SEO pages are present
no duplicates
all URLs are HTTPS
all URLs use mathboard.app
all canonical URLs equal sitemap URLs
```

## 26.4 KaTeX

Tutti gli esempi di `/docs/latex/` devono essere renderizzati con `throwOnError: true` in build.

Build failure se una formula non è valida.

---

# 27. Performance budget

Le pagine SEO devono essere più leggere dell’app.

Target pragmatici:

```text
Initial HTML: < 80 KB uncompressed
CSS custom: < 30 KB uncompressed
JS custom: < 10 KB before analytics script
No Vue bundle on SEO pages
No Fabric.js on SEO pages
No client-side KaTeX rendering for static examples
```

Immagini:

- WebP/AVIF quando pratico;
- dimensioni esplicite;
- niente immagini multi-megabyte;
- screenshot non necessari sotto ~200–300 KB ciascuno come target operativo.

Questi non sono “ranking hacks”; evitano che una pagina di documentazione diventi più pesante del prodotto che descrive.

---

# 28. Accessibility

Requisiti:

- contrasto leggibile;
- keyboard focus visibile;
- skip link;
- nav con label;
- alt text;
- niente clickable `<div>` quando può essere `<a>` o `<button>`;
- code blocks scrollabili su mobile;
- tabelle responsive;
- `lang="en"`;
- non affidarsi solo al colore per comunicare stato.

---

# 29. 404

Generare `dist/404.html` con una pagina minima:

```text
Page not found

The URL does not exist.

[Open MathBoard]
[Resources]
```

Niente search box se non esiste un search backend.

Niente contenuto SEO.

Se si usa Cloudflare `not_found_handling: 404-page`, verificare in staging che URL casuale restituisca davvero HTTP 404.

Test:

```bash
curl -I https://staging.mathboard.app/this-page-does-not-exist
```

Expected:

```text
HTTP/... 404
```

---

# 30. Linkability / backlink engineering senza outreach spam

Il coding agent non deve implementare outreach, ma può rendere le pagine più “linkable”.

Le migliori candidate:

## `/docs/latex/`

Linkabile come quick reference concreta.

## `/open-source-math-whiteboard/`

Linkabile da:

- raccolte open-source;
- educator tools lists;
- GitHub awesome lists;
- university resources.

## `/docs/keyboard-shortcuts/`

Linkabile dalla documentazione e utile agli utenti esistenti.

## Futuri template funzionanti

Potenzialmente molto più linkabili di articoli generici.

### Non implementare

Widget “copy this badge to your website” o schemi artificiali di link exchange.

---

# 31. GitHub / README alignment

Il README è già una buona superficie descrittiva.

Dopo il deploy delle nuove pagine:

aggiungere una piccola sezione:

```markdown
## Documentation

- [MathBoard resources](https://mathboard.app/resources/)
- [LaTeX formulas](https://mathboard.app/docs/latex/)
- [Keyboard shortcuts](https://mathboard.app/docs/keyboard-shortcuts/)
```

Questo crea link naturali dal repository alle risorse e mantiene docs e prodotto collegati.

Non trasformare il README in un testo SEO.

---

# 32. Release sequencing

## PR 1 — Infrastructure

Implementare soltanto:

- SEO generator;
- shared layout;
- CSS;
- 404;
- sitemap generator;
- resource hub molto minimale;
- build scripts;
- tests/validation.

Acceptance:

```text
npm run build
```

produce correttamente app + static pages.

## PR 2 — Core product pages

Aggiungere:

```text
/math-whiteboard/
/latex-whiteboard/
```

con screenshot reali e KaTeX build-time.

## PR 3 — Docs

Aggiungere:

```text
/docs/latex/
/docs/keyboard-shortcuts/
```

Refactor shortcut reference se necessario.

## PR 4 — Open source + discoverability

Aggiungere:

```text
/open-source-math-whiteboard/
```

poi link `Resources` nell’About modal e aggiornamento README.

## PR 5 — Analytics + polish

- CTA tracking;
- final structured data validation;
- accessibility checks;
- Search Console submission checklist.

Separare le PR facilita review e rollback.

---

# 33. Acceptance criteria finali

La feature è completata quando:

### Home

- [ ] `/` apre direttamente la board come prima.
- [ ] nessun nuovo scroll marketing obbligatorio.
- [ ] nessuna regressione tool/canvas.
- [ ] metadata rimangono validi.

### Static pages

- [ ] ogni route restituisce HTML con contenuto senza eseguire JS;
- [ ] ogni route ha title unico;
- [ ] meta description unica;
- [ ] canonical self-referencing;
- [ ] un solo H1;
- [ ] internal links crawlable;
- [ ] real screenshots only;
- [ ] CTA punta a `/`;
- [ ] mobile usable;
- [ ] 404 reale sugli URL inesistenti.

### Build

- [ ] `npm run build` genera tutto;
- [ ] zero page-definition duplicates;
- [ ] KaTeX examples compile;
- [ ] sitemap è generata;
- [ ] build fallisce per config invalida.

### SEO hygiene

- [ ] nessun testo nascosto;
- [ ] nessuna doorway page;
- [ ] nessun contenuto generato automaticamente;
- [ ] nessuna falsa review/statistica;
- [ ] nessun canonical globale verso `/`;
- [ ] nessun fallback SPA che restituisce 200 per URL inesistenti.

### Measurement

- [ ] sitemap inviata a Search Console;
- [ ] tutte le Phase 1 URLs ispezionate;
- [ ] Simple Analytics misura le landing;
- [ ] CTA SEO tracciate o almeno distinguibili per page referrer.

---

# 34. Manual QA commands

Dopo deploy su staging/production:

```bash
curl -I https://mathboard.app/
curl -I https://mathboard.app/resources/
curl -I https://mathboard.app/math-whiteboard/
curl -I https://mathboard.app/latex-whiteboard/
curl -I https://mathboard.app/docs/latex/
curl -I https://mathboard.app/docs/keyboard-shortcuts/
curl -I https://mathboard.app/open-source-math-whiteboard/
curl -I https://mathboard.app/definitely-not-a-real-page
```

Verificare redirect canonical trailing slash:

```bash
curl -I https://mathboard.app/latex-whiteboard
```

Expected:

```text
redirect -> /latex-whiteboard/
```

Controllare HTML senza JS:

```bash
curl -s https://mathboard.app/latex-whiteboard/ | less
```

Nel source devono già essere presenti:

- `<title>`;
- meta description;
- canonical;
- `<h1>`;
- testo principale;
- formula examples;
- link `/`;
- internal links.

Non devono comparire solo placeholder tipo:

```html
<div id="app"></div>
```

per queste pagine.

---

# 35. Content review rubric

Prima di merge, ogni nuova pagina riceve un semplice review qualitativo binario.

## Ship se

- è specifica;
- è verificabile;
- è utile;
- è concisa;
- mostra il prodotto vero;
- aggiunge informazione nuova rispetto alle altre pagine.

## Non ship se

- sembra un articolo scritto per una keyword;
- la prima frase potrebbe appartenere a qualsiasi SaaS;
- contiene frasi non verificabili;
- ripete una landing esistente cambiando audience;
- necessita di 1.000 parole per giustificare la propria esistenza;
- non offre nulla oltre a una CTA.

### Test pratico “remove brand”

Rimuovere la parola “MathBoard” dal testo.

Se il copy potrebbe essere incollato sul sito di qualsiasi whiteboard concorrente senza quasi modifiche, riscriverlo.

---

# 36. Backlog ordinato per impatto / effort

## P0 — implementare

1. Static SEO generator.
2. `/resources/`.
3. Generated sitemap.
4. Real 404.
5. `/math-whiteboard/`.
6. `/latex-whiteboard/`.
7. `/docs/latex/`.
8. `/docs/keyboard-shortcuts/`.
9. `/open-source-math-whiteboard/`.
10. Resources link nell’About modal.

## P1 — dopo indexing iniziale

1. Search Console review.
2. migliorare title/snippet con query reali;
3. ottimizzare internal linking;
4. screenshot/demo migliori;
5. README docs links;
6. structured data validation;
7. CTA analytics.

## P2 — solo con evidenza

1. teacher-specific use case;
2. tutor-specific use case;
3. templates caricabili;
4. changelog pubblico;
5. eventuale localizzazione italiana manuale.

## P3 — evitare finché non cambia il prodotto

1. programmatic SEO;
2. decine di subject pages;
3. auto-generated comparisons;
4. AI-generated blog;
5. translation at scale.

---

# 37. Suggested implementation detail: page validator

Implementare qualcosa di simile:

```js
function validatePages(pages) {
  const paths = new Set()
  const titles = new Set()
  const descriptions = new Set()

  for (const page of pages) {
    if (!page.path?.startsWith('/') || !page.path.endsWith('/')) {
      throw new Error(`SEO path must use leading and trailing slash: ${page.path}`)
    }

    if (paths.has(page.path)) {
      throw new Error(`Duplicate SEO path: ${page.path}`)
    }
    paths.add(page.path)

    if (!page.title?.trim()) {
      throw new Error(`Missing title: ${page.path}`)
    }
    if (titles.has(page.title)) {
      throw new Error(`Duplicate title: ${page.title}`)
    }
    titles.add(page.title)

    if (!page.description?.trim()) {
      throw new Error(`Missing description: ${page.path}`)
    }
    if (descriptions.has(page.description)) {
      throw new Error(`Duplicate description: ${page.path}`)
    }
    descriptions.add(page.description)

    if (!page.h1?.trim()) {
      throw new Error(`Missing h1: ${page.path}`)
    }

    if (!page.body?.trim()) {
      throw new Error(`Missing body: ${page.path}`)
    }
  }
}
```

Questo elimina diversi errori prima del deploy.

---

# 38. Suggested implementation detail: escaping

Metadata e valori di testo devono essere escaped.

Utility minima:

```js
export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
```

Se `body` è HTML trusted scritto nel repo, non passarlo interamente attraverso escape; ma non interpolare dati esterni non trusted nel body.

Il generator non deve fetchare copy remoto durante build.

---

# 39. Suggested implementation detail: breadcrumbs

Docs possono usare breadcrumbs visibili:

```text
Resources / LaTeX formula examples
```

Markup:

```html
<nav aria-label="Breadcrumb">
  <ol class="breadcrumbs">
    <li><a href="/resources/">Resources</a></li>
    <li aria-current="page">LaTeX formula examples</li>
  </ol>
</nav>
```

JSON-LD `BreadcrumbList` può essere generato dalla stessa configurazione, ma solo se il breadcrumb è realmente visibile/coerente.

---

# 40. Suggested implementation detail: CTA

Un componente CTA condiviso va bene perché è UI, non copy editoriale.

```js
export function renderOpenBoardCTA({ placement }) {
  return `
    <a
      class="button button-primary"
      href="/"
      data-seo-cta="open-board"
      data-placement="${escapeHtml(placement)}"
    >Open MathBoard</a>
  `
}
```

Non cambiare CTA per infilare keyword diverse in ogni pagina.

Usare quasi sempre:

```text
Open MathBoard
```

È più umano e coerente.

---

# 41. Suggested implementation detail: source-of-truth LaTeX examples

Creare:

```text
seo/data/latex-examples.mjs
```

Esempio:

```js
export const LATEX_EXAMPLES = [
  {
    category: 'Basics',
    label: 'Energy equation',
    source: 'E = mc^2',
  },
  {
    category: 'Fractions',
    label: 'Fraction',
    source: '\\frac{a}{b}',
  },
  {
    category: 'Roots',
    label: 'Square root',
    source: '\\sqrt{x^2 + y^2}',
  },
  {
    category: 'Calculus',
    label: 'Definite integral',
    source: '\\int_{a}^{b} f(x)\\,dx',
  },
]
```

Usare lo stesso dataset per:

- `/latex-whiteboard/` subset;
- `/docs/latex/` full list;
- eventuali future tests.

Questo è riuso di dati reali, non template copy.

---

# 42. Suggested implementation detail: avoid dependency explosion

Non aggiungere un SSG framework per sei pagine.

Dipendenze nuove desiderate: **zero**, se possibile.

Si può usare:

- Node standard library;
- KaTeX già installato;
- codice HTML/CSS custom.

Se diventa necessario un parser HTML per test, valutare una dependency piccola solo quando il regex/static validation non basta.

---

# 43. Verifica di regressione dell’app

La feature SEO non deve cambiare bundle o comportamento app più del necessario.

Test manuali su `/`:

- draw;
- select;
- pan;
- text;
- formula insert;
- formula edit;
- shapes;
- color;
- undo;
- redo;
- theme cycle;
- zoom;
- fullscreen;
- About modal;
- mobile toolbar.

Confrontare bundle Vite prima/dopo. Le SEO pages non devono importare accidentalmente `App.vue`, `fabric` o tutto il bundle principale.

---

# 44. Monitoring dopo il lancio

Non cambiare strategia ogni giorno.

Prima finestra utile: circa 4–8 settimane per avere segnali iniziali, salvo problemi di crawl/indexing evidenti.

Monitorare:

```text
Index coverage
Sitemap discovered URLs
Queries per page
Impressions
CTR
Average position
Organic landing pageviews
CTA clicks
Board engaged
```

## Decision rules

### Caso A

`/latex-whiteboard/` ha impression ma CTR basso.

Azione:

- migliorare title/snippet;
- verificare match dell’intento;
- non creare subito altre pagine.

### Caso B

La pagina ha click ma pochissimi CTA.

Azione:

- migliorare demo/screenshot;
- rendere più chiaro cosa fa il prodotto;
- verificare che il visitatore possa aprire la board rapidamente.

### Caso C

Una query teacher-specific appare spesso su `/math-whiteboard/`.

Azione:

- prima aggiungere una sezione utile nella pagina esistente;
- solo se il tema diventa abbastanza distinto, valutare una nuova pagina.

### Caso D

Nessuna impression su una pagina dopo un periodo ragionevole.

Azione:

- verificare indexing e internal links;
- verificare se la pagina risponde davvero a una domanda;
- non allungare il testo automaticamente.

---

# 45. Definition of Done per l’agente di coding

Il coding agent non deve considerare completato il task quando “le pagine esistono”.

Completato significa:

1. architettura sidecar implementata;
2. home invariata funzionalmente;
3. sei pagine Phase 1 implementate;
4. content scritto in modo conciso/fattuale;
5. KaTeX static rendering funzionante;
6. sitemap generata;
7. robots corretto;
8. canonical coerenti;
9. 404 reale;
10. no SPA fallback indesiderato;
11. resources link nell’About modal;
12. analytics static page integrata o esplicitamente documentata come follow-up;
13. build validation;
14. manual QA completato;
15. nessuna feature dichiarata ma inesistente;
16. nessuna pagina creata unicamente per una variante di keyword.

---

# 46. Note per il coding agent: cosa NON “migliorare” autonomamente

Questi vincoli sono intenzionali.

Non:

- trasformare `/` in una landing;
- aggiungere SSR alla board;
- aggiungere un blog engine;
- aggiungere un CMS;
- aggiungere una hero alla home;
- aggiungere testo invisibile;
- generare 50 pagine a partire da keyword;
- generare contenuti con un LLM;
- inventare testimonials;
- inventare numeri di utenti;
- dire “no signup required” senza verificare che resti vero;
- dire “collaborative” se non esiste collaborazione real-time;
- dire “export” se la feature non è presente/verificata nella versione corrente;
- dire “handwriting to LaTeX” se non esiste;
- creare competitor pages senza brief specifico;
- aggiungere cookie/analytics behavior diverso senza rispettare l’impostazione privacy corrente.

Se una nuova feature del prodotto rende utile una nuova pagina, aggiungerla in un secondo momento.

---

# 47. Riferimenti tecnici esterni

Per implementazione e verifica:

- Google JavaScript SEO basics  
  `https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics`

- Google SEO guide for developers  
  `https://developers.google.com/search/docs/fundamentals/get-started-developers`

- Google guidance on generative AI content  
  `https://developers.google.com/search/docs/fundamentals/using-gen-ai-content`

- Google spam policies / scaled content abuse  
  `https://developers.google.com/search/docs/essentials/spam-policies`

- Google SoftwareApplication structured data  
  `https://developers.google.com/search/docs/appearance/structured-data/software-app`

- Vite multi-page build documentation, utile come riferimento anche se questa specifica preferisce il post-build generator  
  `https://vite.dev/guide/build#multi-page-app`

- Cloudflare Static Assets  
  `https://developers.cloudflare.com/workers/static-assets/`

- Cloudflare HTML handling  
  `https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/`

- Cloudflare static-site generation / 404 behavior  
  `https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/`

---

# 48. Decisione finale

Per MathBoard, la SEO non deve essere un layer di marketing incollato sopra il prodotto.

La struttura desiderata è:

```text
                  /docs/latex/
                       |
                       v
/resources/ -> /latex-whiteboard/ -> /
     |                                ^
     |                                |
     +-> /math-whiteboard/ -----------+
     |
     +-> /docs/keyboard-shortcuts/ ---+
     |
     +-> /open-source-math-whiteboard/
```

`/` rimane la board.

Le altre pagine esistono per spiegare, documentare o dimostrare capacità reali della board.

La crescita futura deve avvenire aggiungendo **nuova utilità**, non aggiungendo **nuove parole**.

