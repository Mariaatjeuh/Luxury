# Lash Finder — AI oog scan

Inhoud van de Shopify-pagina `find-your-lash-match` (quiz + oog scan).

- `page-body.html` — nieuwe pagina-inhoud, met de scan in de browser (MediaPipe Face Landmarker).
- `page-body.live-backup.html` — de live pagina zoals die was vóór deze wijziging (scan riep de Anthropic API aan zonder sleutel en werkte nooit).
- `src/` — de losse onderdelen van de scan (HTML, CSS, JS). `test/merge.py` voegt ze samen met de backup tot `page-body.html`.

## Hoe de scan werkt
De foto blijft op het toestel. MediaPipe vindt 478 gezichtspunten; daaruit meten we:
- de hoek tussen binnen- en buitenooghoek (gecorrigeerd voor een scheef hoofd) → opwaarts / neerhangend
- hoogte/breedte van het oog → rond / amandel
- oogbreedte t.o.v. gezichtsbreedte → klein / gemiddeld / groot

Hangend ooglid en monolid zijn niet betrouwbaar te meten, daarom volgt een controlevraag. Daarna kiest `getQuizRecs` de producten (dezelfde logica als de quiz).

Foto's worden geweigerd bij: geen gezicht, meerdere gezichten, gezicht te klein, hoofd te schuin, ogen dicht, lachen/samenknijpen.

## Bijstellen
Drempelwaarden staan in `LF_T` bovenaan het scan-script. Open de pagina met `?lfdebug=1` om de gemeten waarden te zien.

## Meten of het verkoopt
- Bij "In mandje" krijgt de winkelmand de bestelkenmerken `Lash Match bron` (AI scan / Quiz) en `Lash Match oogvorm`; die staan bij de bestelling en in de order-export ("Note Attributes").
- Klaviyo krijgt `lash_quiz_bron` bij inschrijving en een `Lash Scan Voltooid` event (alleen voor bekende bezoekers).
