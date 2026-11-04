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

import { escapeHtml } from '../lib/escape-html.mjs'
import { renderOpenBoardCTA, renderScreenshot } from '../lib/render-components.mjs'

export const MATH_WHITEBOARD_ALTERNATES = [
  {
    "lang": "en",
    "label": "English",
    "path": "/math-whiteboard/"
  },
  {
    "lang": "it",
    "label": "Italiano",
    "path": "/it/lavagna-matematica/"
  },
  {
    "lang": "es",
    "label": "Español",
    "path": "/es/pizarra-matematica/"
  },
  {
    "lang": "fr",
    "label": "Français",
    "path": "/fr/tableau-blanc-mathematiques/"
  },
  {
    "lang": "de",
    "label": "Deutsch",
    "path": "/de/mathe-whiteboard/"
  },
  {
    "lang": "pt-BR",
    "label": "Português (Brasil)",
    "path": "/pt-br/lousa-matematica/"
  },
  {
    "lang": "ar",
    "label": "العربية",
    "path": "/ar/math-whiteboard/"
  },
  {
    "lang": "pl",
    "label": "Polski",
    "path": "/pl/tablica-matematyczna/"
  },
  {
    "lang": "zh-CN",
    "label": "简体中文",
    "path": "/zh-cn/math-whiteboard/"
  },
  {
    "lang": "hi",
    "label": "हिन्दी",
    "path": "/hi/math-whiteboard/"
  },
  {
    "lang": "ur",
    "label": "اردو",
    "path": "/ur/math-whiteboard/"
  }
]

const localizedContent = [
  {
    "locale": "it",
    "label": "Italiano",
    "path": "/it/lavagna-matematica/",
    "title": "Lavagna matematica online gratuita — MathBoard",
    "h1": "Lavagna matematica online gratuita",
    "description": "Disegna, scrivi equazioni e modifica formule LaTeX su una lavagna matematica online gratuita. MathBoard funziona nel browser, senza registrazione.",
    "lede": "Scrivi formule LaTeX modificabili, disegna a mano libera e organizza spiegazioni matematiche su un'unica lavagna. Gratuita, open source e subito utilizzabile nel browser.",
    "featuresTitle": "Cosa puoi fare sulla lavagna",
    "features": [
      "Scrivere e modificare formule matematiche in LaTeX con anteprima.",
      "Disegnare a mano libera e aggiungere testo, linee, cerchi e rettangoli.",
      "Ingrandire, spostare la vista, annullare e ripetere le modifiche.",
      "Scegliere tra tema chiaro, scuro e lavagna nera."
    ],
    "workflowTitle": "Una lavagna per spiegare la matematica",
    "workflow": "Puoi combinare passaggi scritti e disegni nello stesso spazio. Le formule restano modificabili: selezionale e riaprile con lo strumento Formula, senza doverle riscrivere da zero.",
    "exampleTitle": "Esempio: spiegare un'equazione",
    "example": "Per mostrare come risolvere 2x + 3 = 11, inserisci l'equazione come formula, disegna frecce fra i passaggi e aggiungi il risultato x = 4. MathBoard non risolve l'equazione automaticamente: sei tu a costruire la spiegazione.",
    "note": "La documentazione collegata e l'interfaccia della lavagna sono attualmente in inglese.",
    "relatedTitle": "Altre risorse",
    "relatedLabel": "Esempi di formule LaTeX (in inglese)",
    "open": "Apri MathBoard",
    "ui": {
      "skip": "Vai al contenuto",
      "primary": "Navigazione principale",
      "resources": "Risorse",
      "download": "Download",
      "downloads": "Versione desktop",
      "shortcuts": "Scorciatoie da tastiera",
      "latex": "Esempi LaTeX",
      "privacy": "Privacy",
      "footer": "Navigazione a piè di pagina",
      "footerNote": "MathBoard è gratuito e open source con licenza GNU AGPL v3.",
      "breadcrumb": "Percorso di navigazione",
      "languages": "Altre lingue"
    }
  },
  {
    "locale": "es",
    "label": "Español",
    "path": "/es/pizarra-matematica/",
    "title": "Pizarra online para matemáticas gratis — MathBoard",
    "h1": "Pizarra online para matemáticas gratis",
    "description": "Dibuja, explica ejercicios y edita fórmulas LaTeX en una pizarra online para matemáticas. Gratis, de código abierto y sin registro.",
    "lede": "Combina dibujo a mano alzada, texto, figuras y fórmulas LaTeX editables en una sola pizarra. Empieza directamente desde el navegador, sin crear una cuenta.",
    "featuresTitle": "Qué puedes hacer",
    "features": [
      "Escribir y volver a editar fórmulas LaTeX con vista previa.",
      "Dibujar a mano alzada y añadir texto, círculos, líneas y rectángulos.",
      "Ampliar, mover el lienzo, deshacer y rehacer cambios.",
      "Cambiar entre temas claro, oscuro y de pizarra tradicional."
    ],
    "workflowTitle": "Una pizarra para explicar matemáticas",
    "workflow": "Escribe una fórmula junto a un dibujo y organiza los pasos de la explicación en el mismo lienzo. Las fórmulas siguen siendo editables desde la herramienta de fórmulas.",
    "exampleTitle": "Ejemplo: explicar una ecuación",
    "example": "Para trabajar 2x + 3 = 11, inserta la ecuación, dibuja flechas entre los pasos y escribe x = 4 al final. MathBoard no resuelve ecuaciones automáticamente: tú creas la explicación.",
    "note": "La interfaz de la pizarra y la documentación enlazada están disponibles actualmente en inglés.",
    "relatedTitle": "Recursos relacionados",
    "relatedLabel": "Ejemplos de fórmulas LaTeX (en inglés)",
    "open": "Abrir MathBoard",
    "ui": {
      "skip": "Saltar al contenido",
      "primary": "Navegación principal",
      "resources": "Recursos",
      "download": "Descargar",
      "downloads": "Descargas para ordenador",
      "shortcuts": "Atajos de teclado",
      "latex": "Ejemplos LaTeX",
      "privacy": "Privacidad",
      "footer": "Navegación del pie de página",
      "footerNote": "MathBoard es gratuito y de código abierto bajo la licencia GNU AGPL v3.",
      "breadcrumb": "Ruta de navegación",
      "languages": "Otros idiomas"
    }
  },
  {
    "locale": "fr",
    "label": "Français",
    "path": "/fr/tableau-blanc-mathematiques/",
    "title": "Tableau blanc en ligne pour les maths — MathBoard",
    "h1": "Tableau blanc en ligne pour les maths",
    "description": "Dessinez, annotez et modifiez des formules LaTeX sur un tableau blanc en ligne pour les maths. Gratuit, open source et sans inscription.",
    "lede": "Réunissez le dessin à main levée, le texte, les formes et les formules LaTeX modifiables sur un seul tableau. Utilisable gratuitement et sans compte dans votre navigateur.",
    "featuresTitle": "Ce que vous pouvez faire",
    "features": [
      "Saisir et modifier des formules LaTeX avec un aperçu.",
      "Dessiner à main levée et ajouter du texte, des lignes, des cercles et des rectangles.",
      "Zoomer, déplacer la vue, annuler et rétablir des actions.",
      "Choisir un thème clair, sombre ou tableau noir."
    ],
    "workflowTitle": "Expliquer les mathématiques visuellement",
    "workflow": "Associez une équation à un schéma sur le même espace de travail. Les formules restent modifiables : sélectionnez-les et rouvrez l'outil de formule pour les corriger.",
    "exampleTitle": "Exemple : expliquer une équation",
    "example": "Pour présenter 2x + 3 = 11, saisissez l'équation, tracez des flèches entre les étapes et notez x = 4. MathBoard ne résout pas l'équation automatiquement : vous construisez l'explication.",
    "note": "L'interface de l'application et les ressources liées sont actuellement en anglais.",
    "relatedTitle": "Ressources associées",
    "relatedLabel": "Exemples de formules LaTeX (en anglais)",
    "open": "Ouvrir MathBoard",
    "ui": {
      "skip": "Aller au contenu",
      "primary": "Navigation principale",
      "resources": "Ressources",
      "download": "Télécharger",
      "downloads": "Téléchargements ordinateur",
      "shortcuts": "Raccourcis clavier",
      "latex": "Exemples LaTeX",
      "privacy": "Confidentialité",
      "footer": "Navigation du pied de page",
      "footerNote": "MathBoard est gratuit et open source sous licence GNU AGPL v3.",
      "breadcrumb": "Fil d'Ariane",
      "languages": "Autres langues"
    }
  },
  {
    "locale": "de",
    "label": "Deutsch",
    "path": "/de/mathe-whiteboard/",
    "title": "Kostenloses Online-Whiteboard für Mathe — MathBoard",
    "h1": "Kostenloses Online-Whiteboard für Mathe",
    "description": "Erkläre Mathe mit Zeichnungen, Formen und bearbeitbaren LaTeX-Formeln. MathBoard ist ein kostenloses Online-Whiteboard ohne Anmeldung.",
    "lede": "Zeichne Skizzen, schreibe Texte und bearbeite LaTeX-Formeln auf einer einzigen Mathe-Tafel. Kostenlos, quelloffen und direkt im Browser nutzbar.",
    "featuresTitle": "Das kannst du machen",
    "features": [
      "LaTeX-Formeln mit Vorschau einfügen und später bearbeiten.",
      "Freihand zeichnen sowie Text, Linien, Kreise und Rechtecke ergänzen.",
      "Zoomen, die Ansicht verschieben und Schritte rückgängig machen oder wiederholen.",
      "Zwischen hellem, dunklem und Kreidetafel-Design wechseln."
    ],
    "workflowTitle": "Mathematik Schritt für Schritt erklären",
    "workflow": "Skizzen und Formeln lassen sich auf derselben Fläche kombinieren. Formeln bleiben bearbeitbar: Wähle sie aus und öffne sie erneut im Formelwerkzeug.",
    "exampleTitle": "Beispiel: eine Gleichung erklären",
    "example": "Füge für 2x + 3 = 11 die Gleichung ein, zeichne Pfeile zwischen den Umformungen und ergänze x = 4. MathBoard löst die Gleichung nicht automatisch: Du gestaltest den Lösungsweg selbst.",
    "note": "Die Oberfläche der Anwendung und die verlinkte Dokumentation sind derzeit auf Englisch.",
    "relatedTitle": "Weitere Ressourcen",
    "relatedLabel": "LaTeX-Formelbeispiele (Englisch)",
    "open": "MathBoard öffnen",
    "ui": {
      "skip": "Zum Inhalt springen",
      "primary": "Hauptnavigation",
      "resources": "Ressourcen",
      "download": "Download",
      "downloads": "Desktop-Downloads",
      "shortcuts": "Tastenkürzel",
      "latex": "LaTeX-Beispiele",
      "privacy": "Datenschutz",
      "footer": "Fußnavigation",
      "footerNote": "MathBoard ist kostenlos und Open Source unter der GNU AGPL v3.",
      "breadcrumb": "Brotkrumennavigation",
      "languages": "Weitere Sprachen"
    }
  },
  {
    "locale": "pt-BR",
    "label": "Português (Brasil)",
    "path": "/pt-br/lousa-matematica/",
    "title": "Lousa online para matemática grátis — MathBoard",
    "h1": "Lousa online para matemática grátis",
    "description": "Desenhe, explique exercícios e edite fórmulas LaTeX em uma lousa online para matemática. Grátis, código aberto e sem cadastro.",
    "lede": "Reúna desenho à mão livre, textos, formas e fórmulas LaTeX editáveis em uma única lousa. Use gratuitamente no navegador, sem criar uma conta.",
    "featuresTitle": "O que você pode fazer",
    "features": [
      "Inserir e editar fórmulas LaTeX com pré-visualização.",
      "Desenhar à mão livre e adicionar textos, linhas, círculos e retângulos.",
      "Ampliar, mover a tela, desfazer e refazer ações.",
      "Alternar entre os temas claro, escuro e lousa de giz."
    ],
    "workflowTitle": "Uma lousa para explicar matemática",
    "workflow": "Combine uma equação e um desenho na mesma área. As fórmulas continuam editáveis: selecione uma delas e abra novamente a ferramenta de fórmulas.",
    "exampleTitle": "Exemplo: explicar uma equação",
    "example": "Para ensinar 2x + 3 = 11, insira a equação, desenhe setas entre as etapas e escreva x = 4. O MathBoard não resolve a equação automaticamente: você monta a explicação.",
    "note": "A interface da lousa e a documentação vinculada estão disponíveis atualmente em inglês.",
    "relatedTitle": "Outros recursos",
    "relatedLabel": "Exemplos de fórmulas LaTeX (em inglês)",
    "open": "Abrir MathBoard",
    "ui": {
      "skip": "Ir para o conteúdo",
      "primary": "Navegação principal",
      "resources": "Recursos",
      "download": "Baixar",
      "downloads": "Downloads para computador",
      "shortcuts": "Atalhos de teclado",
      "latex": "Exemplos LaTeX",
      "privacy": "Privacidade",
      "footer": "Navegação do rodapé",
      "footerNote": "MathBoard é gratuito e de código aberto sob a licença GNU AGPL v3.",
      "breadcrumb": "Navegação estrutural",
      "languages": "Outros idiomas"
    }
  },
  {
    "locale": "ar",
    "label": "العربية",
    "path": "/ar/math-whiteboard/",
    "title": "سبورة رياضيات مجانية عبر الإنترنت — MathBoard",
    "h1": "سبورة رياضيات مجانية عبر الإنترنت",
    "description": "اكتب المعادلات وارسم الأشكال وعدّل صيغ LaTeX على سبورة رياضيات مجانية عبر الإنترنت. استخدم MathBoard من المتصفح دون تسجيل.",
    "lede": "اجمع بين الرسم الحر والنصوص والأشكال وصيغ LaTeX القابلة للتعديل على سبورة واحدة. MathBoard مجاني ومفتوح المصدر ويعمل مباشرة في المتصفح.",
    "featuresTitle": "ماذا يمكنك أن تفعل؟",
    "features": [
      "إدراج صيغ LaTeX مع معاينة وتعديلها لاحقًا.",
      "الرسم باليد وإضافة النصوص والخطوط والدوائر والمستطيلات.",
      "التكبير وتحريك اللوحة والتراجع عن التغييرات وإعادتها.",
      "التبديل بين المظهر الفاتح والداكن والسبورة الطباشيرية."
    ],
    "workflowTitle": "اشرح الرياضيات خطوة بخطوة",
    "workflow": "يمكنك وضع رسم توضيحي بجانب معادلة على اللوحة نفسها. وتظل الصيغ قابلة للتعديل: حدد الصيغة وافتح أداة الصيغ مرة أخرى.",
    "exampleTitle": "مثال: شرح معادلة",
    "example": "لشرح 2x + 3 = 11، أضف المعادلة وارسم أسهمًا بين الخطوات ثم اكتب x = 4. لا يحل MathBoard المعادلات تلقائيًا؛ أنت من ينشئ الشرح.",
    "note": "واجهة التطبيق والمراجع المرتبطة متوفرة حاليًا باللغة الإنجليزية.",
    "relatedTitle": "موارد إضافية",
    "relatedLabel": "أمثلة صيغ LaTeX (بالإنجليزية)",
    "open": "افتح MathBoard",
    "ui": {
      "skip": "الانتقال إلى المحتوى",
      "primary": "التنقل الرئيسي",
      "resources": "الموارد",
      "download": "تنزيل",
      "downloads": "تنزيل إصدار سطح المكتب",
      "shortcuts": "اختصارات لوحة المفاتيح",
      "latex": "أمثلة LaTeX",
      "privacy": "الخصوصية",
      "footer": "روابط التذييل",
      "footerNote": "MathBoard مجاني ومفتوح المصدر بموجب رخصة GNU AGPL v3.",
      "breadcrumb": "مسار التنقل",
      "languages": "لغات أخرى"
    }
  },
  {
    "locale": "pl",
    "label": "Polski",
    "path": "/pl/tablica-matematyczna/",
    "title": "Darmowa tablica online do matematyki — MathBoard",
    "h1": "Darmowa tablica online do matematyki",
    "description": "Rysuj i wyjaśniaj matematykę na darmowej tablicy online. Dodawaj tekst, figury i edytowalne wzory LaTeX bez rejestracji.",
    "lede": "Łącz rysunki odręczne, tekst, figury i edytowalne wzory LaTeX na jednej tablicy. MathBoard jest darmowy, ma otwarty kod źródłowy i działa w przeglądarce.",
    "featuresTitle": "Co możesz zrobić",
    "features": [
      "Wstawiać i edytować wzory LaTeX z podglądem.",
      "Rysować odręcznie, dodawać tekst, linie, koła i prostokąty.",
      "Powiększać, przesuwać widok oraz cofać i ponawiać zmiany.",
      "Wybierać jasny, ciemny lub kredowy motyw tablicy."
    ],
    "workflowTitle": "Wyjaśniaj matematykę na tablicy",
    "workflow": "Możesz umieścić szkic obok równania i pokazywać kolejne kroki. Wzory pozostają edytowalne: zaznacz je i otwórz ponownie narzędzie do wzorów.",
    "exampleTitle": "Przykład: wyjaśnianie równania",
    "example": "Aby omówić 2x + 3 = 11, dodaj równanie, narysuj strzałki między krokami i wpisz x = 4. MathBoard nie rozwiązuje zadań automatycznie: samodzielnie tworzysz wyjaśnienie.",
    "note": "Interfejs aplikacji i podlinkowana dokumentacja są obecnie w języku angielskim.",
    "relatedTitle": "Powiązane materiały",
    "relatedLabel": "Przykłady wzorów LaTeX (po angielsku)",
    "open": "Otwórz MathBoard",
    "ui": {
      "skip": "Przejdź do treści",
      "primary": "Nawigacja główna",
      "resources": "Materiały",
      "download": "Pobierz",
      "downloads": "Wersja na komputer",
      "shortcuts": "Skróty klawiszowe",
      "latex": "Przykłady LaTeX",
      "privacy": "Prywatność",
      "footer": "Nawigacja stopki",
      "footerNote": "MathBoard jest darmowy i ma otwarty kod źródłowy na licencji GNU AGPL v3.",
      "breadcrumb": "Ścieżka nawigacji",
      "languages": "Inne języki"
    }
  },
  {
    "locale": "zh-CN",
    "label": "简体中文",
    "path": "/zh-cn/math-whiteboard/",
    "title": "免费在线数学白板 — MathBoard",
    "h1": "免费在线数学白板",
    "description": "使用 MathBoard 免费在线数学白板绘图、写文字并编辑 LaTeX 公式。无需注册，在浏览器中即可开始使用。",
    "lede": "在同一块白板上结合手绘图形、文字、几何形状和可编辑的 LaTeX 数学公式。MathBoard 免费、开源，无需注册即可在浏览器中使用。",
    "featuresTitle": "可以做什么",
    "features": [
      "插入 LaTeX 数学公式，预览后仍可继续编辑。",
      "自由绘图，并添加文字、直线、圆形和矩形。",
      "缩放和移动画布，撤销或重做操作。",
      "选择浅色、深色或黑板主题。"
    ],
    "workflowTitle": "用图形与公式讲解数学",
    "workflow": "把公式和示意图放在同一块白板上，按步骤组织内容。数学公式不会变成无法修改的图片：选中后可重新打开公式工具进行编辑。",
    "exampleTitle": "示例：讲解一个方程",
    "example": "例如讲解 2x + 3 = 11 时，可以插入公式、用箭头连接各步骤，并写出 x = 4。MathBoard 不会自动求解方程，讲解步骤由你自己完成。",
    "note": "目前白板界面及链接的帮助文档使用英语。",
    "relatedTitle": "相关资源",
    "relatedLabel": "LaTeX 公式示例（英文）",
    "open": "打开 MathBoard",
    "ui": {
      "skip": "跳转到正文",
      "primary": "主导航",
      "resources": "资源",
      "download": "下载",
      "downloads": "桌面版下载",
      "shortcuts": "键盘快捷键",
      "latex": "LaTeX 示例",
      "privacy": "隐私",
      "footer": "页脚导航",
      "footerNote": "MathBoard 是基于 GNU AGPL v3 许可证的免费开源软件。",
      "breadcrumb": "面包屑导航",
      "languages": "其他语言"
    }
  },
  {
    "locale": "hi",
    "label": "हिन्दी",
    "path": "/hi/math-whiteboard/",
    "title": "गणित के लिए मुफ़्त ऑनलाइन व्हाइटबोर्ड — MathBoard",
    "h1": "गणित के लिए मुफ़्त ऑनलाइन व्हाइटबोर्ड",
    "description": "MathBoard पर गणित के चित्र बनाएं और संपादन योग्य LaTeX सूत्र लिखें। यह मुफ़्त ऑनलाइन व्हाइटबोर्ड ब्राउज़र में बिना पंजीकरण चलता है।",
    "lede": "एक ही व्हाइटबोर्ड पर हाथ से चित्र बनाएं, टेक्स्ट और आकृतियां जोड़ें तथा LaTeX सूत्र लिखकर बाद में संपादित करें। MathBoard मुफ़्त, ओपन-सोर्स और ब्राउज़र में तुरंत उपलब्ध है।",
    "featuresTitle": "आप क्या कर सकते हैं",
    "features": [
      "पूर्वावलोकन के साथ LaTeX सूत्र जोड़ें और फिर संपादित करें।",
      "हाथ से चित्र बनाएं; टेक्स्ट, रेखाएं, वृत्त और आयत जोड़ें।",
      "ज़ूम करें, बोर्ड को खिसकाएं और बदलावों को पूर्ववत या फिर से करें।",
      "हल्की, गहरी और चॉकबोर्ड थीम चुनें।"
    ],
    "workflowTitle": "गणित को चरणों में समझाएं",
    "workflow": "एक ही जगह समीकरण और उसका चित्र रखें। सूत्र संपादन योग्य रहते हैं: उन्हें चुनकर फ़ॉर्मूला टूल में दोबारा खोल सकते हैं।",
    "exampleTitle": "उदाहरण: समीकरण समझाना",
    "example": "2x + 3 = 11 समझाने के लिए समीकरण लिखें, चरणों के बीच तीर बनाएं और अंत में x = 4 जोड़ें। MathBoard अपने-आप उत्तर नहीं निकालता; समाधान के चरण आप तैयार करते हैं।",
    "note": "अभी ऐप का इंटरफ़ेस और लिंक किए गए सहायता पेज अंग्रेज़ी में उपलब्ध हैं।",
    "relatedTitle": "संबंधित संसाधन",
    "relatedLabel": "LaTeX सूत्र उदाहरण (अंग्रेज़ी में)",
    "open": "MathBoard खोलें",
    "ui": {
      "skip": "मुख्य सामग्री पर जाएं",
      "primary": "मुख्य नेविगेशन",
      "resources": "संसाधन",
      "download": "डाउनलोड",
      "downloads": "डेस्कटॉप डाउनलोड",
      "shortcuts": "कीबोर्ड शॉर्टकट",
      "latex": "LaTeX उदाहरण",
      "privacy": "गोपनीयता",
      "footer": "फ़ुटर नेविगेशन",
      "footerNote": "MathBoard GNU AGPL v3 लाइसेंस के अंतर्गत मुफ़्त और ओपन-सोर्स है।",
      "breadcrumb": "पेज पथ",
      "languages": "अन्य भाषाएं"
    }
  },
  {
    "locale": "ur",
    "label": "اردو",
    "path": "/ur/math-whiteboard/",
    "title": "ریاضی کے لیے مفت آن لائن وائٹ بورڈ — MathBoard",
    "h1": "ریاضی کے لیے مفت آن لائن وائٹ بورڈ",
    "description": "MathBoard پر ریاضی کے خاکے بنائیں اور LaTeX فارمولے لکھ کر ترمیم کریں۔ یہ مفت آن لائن وائٹ بورڈ براؤزر میں بغیر رجسٹریشن چلتا ہے۔",
    "lede": "ایک ہی وائٹ بورڈ پر ہاتھ سے ڈرائنگ کریں، متن اور شکلیں شامل کریں اور قابلِ ترمیم LaTeX فارمولے لکھیں۔ MathBoard مفت، اوپن سورس اور براؤزر میں فوراً دستیاب ہے۔",
    "featuresTitle": "آپ کیا کر سکتے ہیں",
    "features": [
      "LaTeX فارمولے پیش نظارہ کے ساتھ شامل کریں اور بعد میں تبدیل کریں۔",
      "ہاتھ سے خاکے بنائیں اور متن، لائنیں، دائرے اور مستطیل شامل کریں۔",
      "زوم کریں، بورڈ کو حرکت دیں اور تبدیلیاں واپس یا دوبارہ کریں۔",
      "روشن، گہرے اور چاک بورڈ تھیم میں سے انتخاب کریں۔"
    ],
    "workflowTitle": "ریاضی کو مرحلہ وار سمجھائیں",
    "workflow": "ایک ہی جگہ مساوات اور اس کا خاکہ رکھ کر وضاحت تیار کریں۔ فارمولے قابلِ ترمیم رہتے ہیں: انہیں منتخب کر کے فارمولا ٹول میں دوبارہ کھولیں۔",
    "exampleTitle": "مثال: مساوات کی وضاحت",
    "example": "2x + 3 = 11 سمجھانے کے لیے مساوات لکھیں، مراحل کے درمیان تیر بنائیں اور آخر میں x = 4 شامل کریں۔ MathBoard خودکار طور پر مساوات حل نہیں کرتا؛ وضاحت آپ خود بناتے ہیں۔",
    "note": "ایپ کا انٹرفیس اور منسلک دستاویزات فی الحال انگریزی میں دستیاب ہیں۔",
    "relatedTitle": "متعلقہ وسائل",
    "relatedLabel": "LaTeX فارمولوں کی مثالیں (انگریزی)",
    "open": "MathBoard کھولیں",
    "ui": {
      "skip": "مواد پر جائیں",
      "primary": "مرکزی نیویگیشن",
      "resources": "وسائل",
      "download": "ڈاؤن لوڈ",
      "downloads": "ڈیسک ٹاپ ڈاؤن لوڈ",
      "shortcuts": "کی بورڈ شارٹ کٹس",
      "latex": "LaTeX مثالیں",
      "privacy": "رازداری",
      "footer": "فوٹر نیویگیشن",
      "footerNote": "MathBoard، GNU AGPL v3 لائسنس کے تحت مفت اور اوپن سورس ہے۔",
      "breadcrumb": "صفحے کا راستہ",
      "languages": "دیگر زبانیں"
    }
  }
]

function renderLocalizedBody(content) {
  const escaped = (value) => escapeHtml(value)
  // Keep left-to-right mathematical notation readable inside RTL prose.
  const mathExample = (value) => escaped(value)
    .replaceAll('2x + 3 = 11', '<bdi dir="ltr">2x + 3 = 11</bdi>')
    .replaceAll('x = 4', '<bdi dir="ltr">x = 4</bdi>')
  const featureItems = content.features
    .map((feature) => '<li>' + escaped(feature) + '</li>')
    .join('\n')
  return [
    '<div class="site-hero site-hero--with-art">',
    '  <div>',
    '    <p class="editorial-eyebrow">MathBoard / ' + escaped(content.label) + '</p>',
    '    <h1>' + escaped(content.h1) + '</h1>',
    '    <p class="lede">' + escaped(content.lede) + '</p>',
    '    <p class="cta-row">' + renderOpenBoardCTA({
      placement: 'math-whiteboard-' + content.locale.toLowerCase().replace(/[^a-z]/g, '-') + '-hero',
      label: content.open,
    }) + '</p>',
    '  </div>',
    renderScreenshot({
      src: '/og-image.png',
      alt: content.h1 + ' — MathBoard',
      eager: true,
      caption: content.h1,
    }),
    '</div>',
    '<section><h2>' + escaped(content.featuresTitle) + '</h2><ul>' + featureItems + '</ul></section>',
    '<section><h2>' + escaped(content.workflowTitle) + '</h2><p>' + escaped(content.workflow) + '</p></section>',
    '<section><h2>' + escaped(content.exampleTitle) + '</h2><p>' + mathExample(content.example) + '</p></section>',
    '<section><h2>' + escaped(content.relatedTitle) + '</h2>',
    '  <p><a href="/latex-whiteboard/">' + escaped(content.relatedLabel) + '</a></p>',
    '  <p class="muted">' + escaped(content.note) + '</p>',
    '</section>',
  ].join('\n')
}

// Localized copy is checked into source control; native-speaker review is required before release.
export const localizedMathWhiteboards = localizedContent.map((content) => ({
  path: content.path,
  locale: content.locale,
  dir: content.locale === 'ar' || content.locale === 'ur' ? 'rtl' : 'ltr',
  lastmod: '2026-11-04',
  title: content.title,
  description: content.description,
  h1: content.h1,
  h1InBody: true,
  ogImage: '/og-image.png',
  structuredData: 'software-application',
  ui: { ...content.ui, openBoard: content.open },
  alternates: MATH_WHITEBOARD_ALTERNATES,
  breadcrumbs: [
    { label: 'MathBoard', href: '/' },
    { label: content.ui.resources, href: '/resources/' },
    { label: content.h1 },
  ],
  body: renderLocalizedBody(content),
}))
