/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/


import { renderOpenBoardCTA, renderScreenshot } from '../lib/render-components.mjs'

export default {
  path: '/it/lavagna-matematica/',
  lastmod: '2026-10-21',
  lang: 'it',
  alternates: {
    en: '/math-whiteboard/',
    it: '/it/lavagna-matematica/',
    'x-default': '/math-whiteboard/',
  },
  title: 'Lavagna matematica online gratuita | MathBoard',
  description:
    'Disegna, scrivi formule LaTeX modificabili e prepara spiegazioni di matematica in una lavagna online gratuita e open source, senza registrazione.',
  h1: 'Lavagna matematica online gratuita',
  structuredData: 'software-application',
  breadcrumbs: [
    { label: 'MathBoard', href: '/' },
    { label: 'Lavagna matematica' },
  ],
  body: `
    <p class="lede">
      MathBoard è una lavagna matematica online gratuita e open source: puoi disegnare a mano libera, aggiungere testo,
      inserire formule LaTeX modificabili e costruire spiegazioni sulla stessa superficie.
      Si apre nel browser senza registrazione e non richiede di installare un programma.
    </p>
    <p class="cta-row">${renderOpenBoardCTA({ placement: 'italian-hero', lang: 'it' })}</p>
    ${renderScreenshot({
      src: '/og-image.png',
      alt: 'Esempio di lavagna MathBoard con disegni e formule matematiche',
      eager: true,
      caption: 'Una lavagna unica per annotazioni, schemi e formule.',
    })}
    <section>
      <h2>Per le ripetizioni e le spiegazioni di matematica</h2>
      <p>
        Durante una spiegazione puoi tracciare figure con la penna, inserire un'espressione con lo strumento Formula
        e spostare gli elementi sulla lavagna. Le formule restano modificabili, così puoi correggere un passaggio
        senza riscrivere tutto da capo. Sono disponibili anche rettangoli, cerchi e linee per schemi e geometria.
      </p>
      <p>
        Puoi usare MathBoard mentre condividi il tuo schermo durante una lezione.
        La lavagna non offre una sessione collaborativa in tempo reale:
        per mostrare il lavoro a distanza devi utilizzare separatamente uno strumento di condivisione dello schermo.
      </p>
    </section>
    <section>
      <h2>Scrivere formule LaTeX sulla lavagna</h2>
      <p>
        Premi <kbd>F</kbd> oppure scegli lo strumento Formula, digita il codice LaTeX,
        controlla l'anteprima e inserisci il risultato. Per esempio,
        <code>\\\\frac{a}{b}</code> rappresenta una frazione e <code>\\\\sqrt{x}</code> una radice.
        Selezionando una formula già inserita puoi modificarne il contenuto.
        La <a href="/docs/latex/" hreflang="en">guida agli esempi LaTeX (in inglese)</a>
        raccoglie altre espressioni da provare.
      </p>
    </section>
    <section>
      <h2>Disegno, navigazione e temi</h2>
      <p>
        Oltre alla scrittura libera, puoi selezionare gli oggetti, spostarti nella lavagna,
        ingrandire o ridurre lo zoom e annullare o ripristinare le operazioni.
        I temi disponibili sono chiaro, scuro e lavagna in stile gesso.
        I <a href="/docs/keyboard-shortcuts/" hreflang="en">comandi da tastiera (in inglese)</a>
        aiutano a passare rapidamente da uno strumento all'altro.
      </p>
    </section>
    <section>
      <h2>Apri MathBoard</h2>
      <p>
        Non serve un account per cominciare. L'interfaccia della lavagna è attualmente in inglese;
        questa guida spiega in italiano le funzioni principali.
        MathBoard è distribuita sotto licenza GNU AGPL v3:
        puoi <a href="https://github.com/giacomobartoloni/mathboard">consultare il codice sorgente su GitHub</a>.
      </p>
      <p class="cta-row">${renderOpenBoardCTA({ placement: 'italian-end', lang: 'it' })}</p>
      <p>Preferisci la versione inglese? <a href="/math-whiteboard/" lang="en" hreflang="en">Read this guide in English</a>.</p>
    </section>
  `,
}
