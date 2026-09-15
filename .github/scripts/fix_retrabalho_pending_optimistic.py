from pathlib import Path

p = Path('src/components/OcorrenciaCard.tsx')
s = p.read_text()
old = '      status: status as Status,\n'
new = '''      status: (\n        !gestao && status === "RETRABALHO" ? "RETRABALHO_PENDENTE" : status\n      ) as Status,\n'''
if old not in s:
    if 'status === "RETRABALHO" ? "RETRABALHO_PENDENTE"' in s:
        print('Ajuste já aplicado')
        raise SystemExit(0)
    raise SystemExit('status otimista não encontrado')
p.write_text(s.replace(old, new, 1))
print('Status otimista de retrabalho pendente ajustado')
