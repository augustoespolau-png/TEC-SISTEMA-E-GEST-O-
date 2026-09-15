from pathlib import Path

# Patch temporário: garante preview local caso a URL assinada demore ou falhe.
path = Path('src/components/auditoria/AuditoriaCasa.tsx')
text = path.read_text(encoding='utf-8')
old = '''              url: preparada.url,\n'''
new = '''              url:\n                preparada.url ??\n                (anexo ? URL.createObjectURL(anexo) : null),\n'''
if old not in text:
    raise SystemExit('Trecho de URL da foto não encontrado')
if text.count(old) != 1:
    raise SystemExit(f'Trecho de URL encontrado {text.count(old)} vezes; abortando por segurança')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
