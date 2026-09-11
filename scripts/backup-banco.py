# -*- coding: utf-8 -*-
"""
Copia de seguranca do banco, em CSV, sem depender de nenhum login.

POR QUE ISTO EXISTE
O plano gratuito do Supabase nao faz backup automatico. Em setembro de
2026 a conta Google que abre o Supabase ficou indisponivel por um mes, e
nesse periodo nao havia copia nenhuma dos dados da fabrica. Este script
e a resposta: ele fala direto com o Postgres, entao nao depende do
Google, do GitHub nem do painel do Supabase. Bastam o endereco do banco
e a senha.

COMO RODAR
    set PGPASSWORD=a-senha-do-postgres        (Windows, cmd)
    $env:PGPASSWORD="a-senha-do-postgres"     (Windows, PowerShell)
    export PGPASSWORD=a-senha-do-postgres     (Linux, Mac, Git Bash)
    python scripts/backup-banco.py

A senha NAO fica escrita aqui de proposito. Ela vem do ambiente, e o
script recusa a rodar sem ela.

Gera uma pasta backup-banco-AAAA-MM-DD com um CSV por tabela, mais um
manifesto com a contagem de linhas de cada uma. O CSV sai com separador
ponto e virgula e marca de codificacao, entao abre no Excel em portugues
sem passar pelo assistente de importacao.

DEPENDENCIA
    pip install pg8000
"""

import csv
import datetime
import io
import json
import os
import ssl
import sys

HOST = os.environ.get("PGHOST", "db.teehscpxnmkqpvvchmgo.supabase.co")
PORTA = int(os.environ.get("PGPORT", "5432"))
USUARIO = os.environ.get("PGUSER", "postgres")
BANCO = os.environ.get("PGDATABASE", "postgres")
SENHA = os.environ.get("PGPASSWORD")


def main():
    if not SENHA:
        sys.exit(
            "Falta a senha. Defina PGPASSWORD antes de rodar.\n"
            "Ela esta no documento de entrega, no anexo de senhas."
        )
    try:
        import pg8000.dbapi as db
    except ImportError:
        sys.exit("Falta a biblioteca. Rode: pip install pg8000")

    # O Supabase exige conexao cifrada. A verificacao de certificado fica
    # desligada porque o que protege aqui e a senha, e exigir a cadeia de
    # certificados so faria o backup falhar em maquina mal configurada.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    conexao = db.connect(host=HOST, port=PORTA, user=USUARIO, password=SENHA,
                         database=BANCO, ssl_context=ctx, timeout=30)
    cursor = conexao.cursor()

    pasta = "backup-banco-" + datetime.date.today().isoformat()
    os.makedirs(pasta, exist_ok=True)

    cursor.execute(
        "select table_name from information_schema.tables "
        "where table_schema = 'public' order by table_name"
    )
    tabelas = [linha[0] for linha in cursor.fetchall()]

    manifesto = {
        "gerado_em": datetime.datetime.now().isoformat(timespec="seconds"),
        "servidor": HOST,
        "tabelas": {},
    }

    for tabela in tabelas:
        cursor.execute('select * from public."%s"' % tabela)
        colunas = [c[0] for c in cursor.description]
        linhas = cursor.fetchall()
        caminho = os.path.join(pasta, tabela + ".csv")
        # utf-8-sig e ";" para o Excel em portugues abrir direto
        with io.open(caminho, "w", encoding="utf-8-sig", newline="") as arquivo:
            escritor = csv.writer(arquivo, delimiter=";")
            escritor.writerow(colunas)
            escritor.writerows(linhas)
        manifesto["tabelas"][tabela] = len(linhas)
        print("%-24s %6d linhas" % (tabela, len(linhas)))

    with io.open(os.path.join(pasta, "manifesto.json"), "w", encoding="utf-8") as arquivo:
        json.dump(manifesto, arquivo, indent=2, ensure_ascii=False)

    conexao.close()
    total = sum(manifesto["tabelas"].values())
    print("\n%d tabelas, %d linhas, em %s" % (len(tabelas), total, pasta))


if __name__ == "__main__":
    main()
