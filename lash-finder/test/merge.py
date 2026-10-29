import sys, re
S = sys.argv[1]
b = open(f'{S}/body.html', encoding='utf-8').read()
part = lambda n: open(f'{S}/parts/{n}', encoding='utf-8').read()
def sub(old, new, count=1):
    global b
    assert b.count(old) == count, (old[:60], b.count(old))
    b = b.replace(old, new)

# CSS
sub('</style>', part('scanner.css') + '</style>')
# HTML scanner panel
i = b.index('<!-- AI SCANNER -->'); j = b.index('\n</div>\n<!-- end lf-wrap -->')
b = b[:i] + part('scanner.html').rstrip('\n') + '\n' + b[j:]
# JS scanner (van AI SCANNER header tot EMAIL header)
i = b.index('// ===================================================================\n// AI SCANNER')
j = b.index('// ===================================================================\n// EMAIL OPSLAAN')
b = b[:i] + part('scanner.js') + '\n' + b[j:]
# Bron meesturen naar Klaviyo
sub("lash_quiz_datum: new Date().toLocaleDateString('nl-NL')",
    "lash_quiz_datum: new Date().toLocaleDateString('nl-NL'),\n                    lash_quiz_bron: document.getElementById('lfScanner').classList.contains('active') ? 'AI scan' : 'Quiz'")
# Winkelmand: bron + oogvorm als bestelkenmerk (zichtbaar bij de bestelling in Shopify)
sub("      btn.textContent = '✓ Toegevoegd!';",
    "      btn.textContent = '✓ Toegevoegd!';\n"
    "      const lfBron = btn.closest('#lfScanner') ? 'AI scan' : 'Quiz';\n"
    "      const lfVorm = (btn.closest('.lf-result')?.querySelector('.lf-res-shape em')?.textContent) || '';\n"
    "      fetch('/cart/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attributes: { 'Lash Match bron': lfBron, 'Lash Match oogvorm': lfVorm } }) }).catch(() => {});")
# Tab wisselen: camera uit, scanner alvast laden
sub("  document.getElementById('lfScanner').classList.toggle('active', mode==='scanner');\n}",
    "  document.getElementById('lfScanner').classList.toggle('active', mode==='scanner');\n"
    "  if (mode === 'scanner') lfLoadScanner().catch(() => {}); else lfCamStop();\n}")
open(f'{S}/body-new.html', 'w', encoding='utf-8').write(b)
print('ok', len(b))
